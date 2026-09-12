import createLZFSEModule from "./lzfse/lzfse.js";
const version = "V7";
let lzfseModule = null;
let sourceImage = null;
let colorImage = null;
let paletteImage = null;
let canvas = null;
let ctx = null;
let workspace = null;
let openButton = null;
let openGrilleButton = null;
let clearButton = null;
let imageInput = null;
let grilleInput = null;
let tileSizeInput = null;
let info = null;
let cols = 0;
let rows = 0;
let tileSize = 20;
let selectedTiles = new Set();
let zoomFactor = 1.0;
let panX = 0;
let panY = 0;
let activePointers = new Map();
let singlePointerId = null;
let singlePointerMoved = false;
let singlePointerWorld = null;
let pinchActive = false;
let lastPinchDistance = 0;
let lastPinchCenter = null;
document.addEventListener("DOMContentLoaded", async function () {
    console.log("Pixeliser démarrage...");
    console.log("Version", version);
    canvas = document.getElementById("canvas");
    workspace = document.getElementById("workspace");
    openButton = document.getElementById("openButton");
    openGrilleButton = document.getElementById("openGrilleButton");
    clearButton = document.getElementById("clearButton");
    imageInput = document.getElementById("imageInput");
    grilleInput = document.getElementById("grilleInput");
    tileSizeInput = document.getElementById("tileSize");
    info = document.getElementById("info");
    if (!canvas) {
        console.error("Canvas introuvable.");
        return;
    }
    if (!workspace) {
        console.error("Workspace introuvable.");
        return;
    }
    ctx = canvas.getContext("2d", {
        alpha: false,
        desynchronized: true
    });
    if (!ctx) {
        console.error("Impossible de créer le contexte 2D.");
        return;
    }
    canvas.style.touchAction = "none";
    workspace.style.touchAction = "none";
    if (openButton && imageInput) {
        openButton.addEventListener("click", function () {
            imageInput.click();
        });
    }
    if (imageInput) {
        imageInput.addEventListener("change", function (event) {
            const file = event.target.files && event.target.files[0];
            if (file) {
                loadImageFile(file);
            }
        });
    }
    if (openGrilleButton && grilleInput) {
        openGrilleButton.addEventListener("click", function () {
            grilleInput.click();
        });
    }
    if (grilleInput) {
        grilleInput.addEventListener("change", async function (event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            try {
                await loadGrilleFile(file);
            } catch (error) {
                console.error("Erreur lecture grille :", error);
                alert("Erreur lecture grille :\n" + error.message);
            }
            grilleInput.value = "";
        });
    }
    if (clearButton) {
        clearButton.addEventListener("click", clearSelection);
    }
    if (tileSizeInput) {
        const updateFromInput = function () {
            const value = parseInt(tileSizeInput.value, 10);
            if (!Number.isFinite(value)) return;
            tileSize = Math.max(2, Math.min(100, value));
            tileSizeInput.value = tileSize;
            if (!sourceImage) return;
            recomputeGrid();
            draw();
        };
        tileSizeInput.addEventListener("change", updateFromInput);
    }
    workspace.addEventListener("pointerdown", handlePointerDown, {
        passive: false
    });
    workspace.addEventListener("pointermove", handlePointerMove, {
        passive: false
    });
    workspace.addEventListener("pointerup", handlePointerUp, {
        passive: false
    });
    workspace.addEventListener("pointercancel", handlePointerCancel, {
        passive: false
    });
    workspace.addEventListener("wheel", handleTrackpadWheel, {
        passive: false
    });
    window.addEventListener("resize", function () {
        if (sourceImage) {
            handleWorkspaceResize();
        }
        draw();
    });
    if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(function () {
            if (sourceImage) {
                handleWorkspaceResize();
            }
        });
        resizeObserver.observe(workspace);
    }
    try {
        await initializeLZFSE();
    } catch (error) {
        console.error("LZFSE indisponible :", error);
    }
    console.log("Pixeliser initialisé.");
});
async function initializeLZFSE()
{
    console.log(
        "Chargement du module LZFSE..."
    );
    try
    {
        const module =
            await createLZFSEModule();
        console.log(
            "Module LZFSE créé :",
            module
        );
        console.log(
            "decode_lzfse_memfs :",
            typeof module._decode_lzfse_memfs
        );
        if (
            typeof module._decode_lzfse_memfs !==
            "function"
        )
        {
            throw new Error(
                "_decode_lzfse_memfs n'est pas disponible."
            );
        }
        if (!module.FS)
        {
            throw new Error(
                "Le système de fichiers MEMFS n'est pas disponible."
            );
        }
        lzfseModule =
            module;
        console.log(
            "LZFSE prêt"
        );
    }
    catch (error)
    {
        console.error(
            "ERREUR INITIALISATION LZFSE :",
            error
        );
        throw error;
    }
}
async function decompressLZFSE(
    compressed,
    originalSize
)
{
    if (!lzfseModule)
    {
        throw new Error(
            "Le module LZFSE n'est pas prêt."
        );
    }
    console.log(
        "Décompression LZFSE via MEMFS..."
    );
    console.log(
        "Compressed :",
        compressed.length
    );
    console.log(
        "Expected :",
        originalSize
    );
    const inputPath =
        "/grille_input.lzfse";
    const outputPath =
        "/grille_output.bin";
    try
    {
        lzfseModule.FS.unlink(
            inputPath
        );
    }
    catch (e)
    {
    }
    try
    {
        lzfseModule.FS.unlink(
            outputPath
        );
    }
    catch (e)
    {
    }
    console.log(
        "Copie des données LZFSE dans MEMFS..."
    );
    lzfseModule.FS.writeFile(
        inputPath,
        compressed
    );
    console.log(
        "Fichier MEMFS créé :",
        inputPath
    );
    console.log(
        "Appel decode_lzfse_memfs..."
    );
    const decodedSize =
        lzfseModule._decode_lzfse_memfs(
            originalSize
        );
    console.log(
        "Taille décompressée :",
        decodedSize
    );
    if (decodedSize <= 0)
    {
        throw new Error(
            "Échec de la décompression LZFSE."
        );
    }
    const decoded =
        lzfseModule.FS.readFile(
            outputPath
        );
    console.log(
        "Archive décompressée :",
        decoded.length,
        "octets"
    );
    try
    {
        lzfseModule.FS.unlink(
            inputPath
        );
    }
    catch (e)
    {
    }
    try
    {
        lzfseModule.FS.unlink(
            outputPath
        );
    }
    catch (e)
    {
    }
    return new Uint8Array(
        decoded
    );
}
class BinaryPlistDecoder
{
    constructor(bytes)
    {
        this.bytes = bytes;
        this.objects = [];
        this.offsets = [];
        this.objectRefSize = 0;
        this.offsetIntSize = 0;
        this.numObjects = 0;
        this.topObject = 0;
        this.offsetTableOffset = 0;
    }
    readUIntBE(
        offset,
        size
    )
    {
        let value = 0;
        for (
            let i = 0;
            i < size;
            i++
        )
        {
            value =
                value * 256 +
                this.bytes[
                    offset + i
                ];
        }
        return value;
    }
    readDoubleBE(offset)
    {
        const buffer =
            this.bytes.buffer.slice(
                this.bytes.byteOffset +
                offset,
                this.bytes.byteOffset +
                offset +
                8
            );
        return new DataView(
            buffer
        ).getFloat64(
            0,
            false
        );
    }
    decode()
    {
        if (
            this.bytes.length < 40
        )
        {
            throw new Error(
                "Binary plist trop court."
            );
        }
        const magic =
            String.fromCharCode(
                this.bytes[0],
                this.bytes[1],
                this.bytes[2],
                this.bytes[3],
                this.bytes[4],
                this.bytes[5],
                this.bytes[6],
                this.bytes[7]
            );
        if (magic !== "bplist00")
        {
            throw new Error(
                "Ce fichier n'est pas un binary plist."
            );
        }
        const trailer =
            this.bytes.length - 32;
        this.offsetIntSize =
            this.bytes[
                trailer + 6
            ];
        this.objectRefSize =
            this.bytes[
                trailer + 7
            ];
        this.numObjects =
            this.readUIntBE(
                trailer + 8,
                8
            );
        this.topObject =
            this.readUIntBE(
                trailer + 16,
                8
            );
        this.offsetTableOffset =
            this.readUIntBE(
                trailer + 24,
                8
            );
        console.log(
            "Binary plist :",
            {
                offsetIntSize:
                    this.offsetIntSize,
                objectRefSize:
                    this.objectRefSize,
                numObjects:
                    this.numObjects,
                topObject:
                    this.topObject,
                offsetTableOffset:
                    this.offsetTableOffset
            }
        );
        this.offsets =
            new Array(
                this.numObjects
            );
        for (
            let i = 0;
            i < this.numObjects;
            i++
        )
        {
            this.offsets[i] =
                this.readUIntBE(
                    this.offsetTableOffset +
                    i *
                    this.offsetIntSize,
                    this.offsetIntSize
                );
        }
        this.objects =
            new Array(
                this.numObjects
            );
        return this.decodeObject(
            this.topObject
        );
    }
    decodeObject(ref)
    {
        if (
            ref < 0 ||
            ref >= this.numObjects
        )
        {
            throw new Error(
                "Référence objet invalide : " +
                ref
            );
        }
        if (
            this.objects[ref] !== undefined
        )
        {
            return this.objects[ref];
        }
        const offset =
            this.offsets[ref];
        const marker =
            this.bytes[offset];
        const type =
            marker >> 4;
        const info =
            marker & 0x0F;
        let value;
        switch (type)
        {
            case 0x0:
                value =
                    this.decodeSimple(
                        info
                    );
                break;
            case 0x1:
                value =
                    this.decodeInteger(
                        info,
                        offset
                    );
                break;
            case 0x2:
                value =
                    this.decodeReal(
                        info,
                        offset
                    );
                break;
            case 0x3:
                value =
                    this.decodeDate(
                        info,
                        offset
                    );
                break;
            case 0x4:
                value =
                    this.decodeData(
                        info,
                        offset
                    );
                break;
            case 0x5:
                value =
                    this.decodeASCII(
                        info,
                        offset
                    );
                break;
            case 0x6:
                value =
                    this.decodeUTF16(
                        info,
                        offset
                    );
                break;
            case 0x8:
                value =
                    this.decodeUID(
                        info,
                        offset
                    );
                break;
            case 0xA:
                value =
                    this.decodeArray(
                        info,
                        offset
                    );
                break;
            case 0xD:
                value =
                    this.decodeDictionary(
                        info,
                        offset
                    );
                break;
            default:
                throw new Error(
                    "Type plist inconnu : 0x" +
                    type.toString(16)
                );
        }
        this.objects[ref] =
            value;
        return value;
    }
    decodeLength(
        info,
        offset
    )
    {
        if (
            info < 0x0F
        )
        {
            return {
                length: info,
                offset: offset + 1
            };
        }
        const marker =
            this.bytes[
                offset + 1
            ];
        const type =
            marker >> 4;
        const integerInfo =
            marker & 0x0F;
        if (type !== 0x1)
        {
            throw new Error(
                "Longueur plist invalide."
            );
        }
        const byteCount =
            1 << integerInfo;
        const length =
            this.readUIntBE(
                offset + 2,
                byteCount
            );
        return {
            length: length,
            offset:
                offset +
                2 +
                byteCount
        };
    }
    decodeSimple(info)
    {
        switch (info)
        {
            case 0x0:
                return null;
            case 0x8:
                return false;
            case 0x9:
                return true;
            default:
                return {
                    plistSimple: info
                };
        }
    }
    decodeInteger(
        info,
        offset
    )
    {
        const byteCount =
            1 << info;
        return this.readUIntBE(
            offset + 1,
            byteCount
        );
    }
    decodeReal(
        info,
        offset
    )
    {
        const byteCount =
            1 << info;
        if (byteCount === 4)
        {
            const buffer =
                this.bytes.buffer.slice(
                    this.bytes.byteOffset +
                    offset + 1,
                    this.bytes.byteOffset +
                    offset + 5
                );
            return new DataView(
                buffer
            ).getFloat32(
                0,
                false
            );
        }
        if (byteCount === 8)
        {
            return this.readDoubleBE(
                offset + 1
            );
        }
        throw new Error(
            "REAL plist non supporté."
        );
    }
    decodeDate(
        info,
        offset
    )
    {
        if (info !== 0x3)
        {
            throw new Error(
                "DATE plist invalide."
            );
        }
        return this.readDoubleBE(
            offset + 1
        );
    }
    decodeData(
        info,
        offset
    )
    {
        const result =
            this.decodeLength(
                info,
                offset
            );
        return this.bytes.slice(
            result.offset,
            result.offset +
            result.length
        );
    }
    decodeASCII(
        info,
        offset
    )
    {
        const result =
            this.decodeLength(
                info,
                offset
            );
        let text = "";
        for (
            let i = 0;
            i < result.length;
            i++
        )
        {
            text += String.fromCharCode(
                this.bytes[
                    result.offset + i
                ]
            );
        }
        return text;
    }
    decodeUTF16(
        info,
        offset
    )
    {
        const result =
            this.decodeLength(
                info,
                offset
            );
        let text = "";
        for (
            let i = 0;
            i < result.length;
            i++
        )
        {
            const p =
                result.offset +
                i * 2;
            const code =
                (this.bytes[p] << 8) |
                this.bytes[p + 1];
            text += String.fromCharCode(
                code
            );
        }
        return text;
    }
    decodeUID(
        info,
        offset
    )
    {
        const length =
            info + 1;
        let value = 0;
        for (
            let i = 0;
            i < length;
            i++
        )
        {
            value =
                value * 256 +
                this.bytes[
                    offset + 1 + i
                ];
        }
        return {
            uid: value
        };
    }
    decodeArray(
        info,
        offset
    )
    {
        const result =
            this.decodeLength(
                info,
                offset
            );
        let pos =
            result.offset;
        const array =
            new Array(
                result.length
            );
        for (
            let i = 0;
            i < result.length;
            i++
        )
        {
            const ref =
                this.readUIntBE(
                    pos,
                    this.objectRefSize
                );
            pos +=
                this.objectRefSize;
            array[i] =
                this.decodeObject(
                    ref
                );
        }
        return array;
    }
    decodeDictionary(
        info,
        offset
    )
    {
        const result =
            this.decodeLength(
                info,
                offset
            );
        const count =
            result.length;
        let pos =
            result.offset;
        const keyRefs =
            new Array(count);
        const valueRefs =
            new Array(count);
        for (
            let i = 0;
            i < count;
            i++
        )
        {
            keyRefs[i] =
                this.readUIntBE(
                    pos,
                    this.objectRefSize
                );
            pos +=
                this.objectRefSize;
        }
        for (
            let i = 0;
            i < count;
            i++
        )
        {
            valueRefs[i] =
                this.readUIntBE(
                    pos,
                    this.objectRefSize
                );
            pos +=
                this.objectRefSize;
        }
        const dictionary = {};
        for (
            let i = 0;
            i < count;
            i++
        )
        {
            const key =
                this.decodeObject(
                    keyRefs[i]
                );
            const value =
                this.decodeObject(
                    valueRefs[i]
                );
            dictionary[key] =
                value;
        }
        return dictionary;
    }
}
function isUID(value)
{
    return (
        value &&
        typeof value === "object" &&
        Object.prototype.hasOwnProperty.call(
            value,
            "uid"
        )
    );
}
class KeyedArchiveResolver
{
    constructor(plist, decoderObjects = null)
    {
        this.plist = plist;
        this.rootObject = null;
        this.objects = plist["$objects"];
        if (!Array.isArray(this.objects))
        {
            if (Array.isArray(decoderObjects) && Array.isArray(plist["NS.keys"]) && Array.isArray(plist["NS.objects"]))
            {
                this.objects = decoderObjects;
                this.rootObject = plist;
            }
            else
            {
                throw new Error("Objets NSKeyedArchiver absents ou invalides.");
            }
        }
        this.cache = new Map();
        this.resolving = new Set();
    }
    resolveUID(uidObject)
    {
        if (!isUID(uidObject))
        {
            return uidObject;
        }
        return this.resolveIndex(
            uidObject.uid
        );
    }
    resolveIndex(index)
    {
        if (
            index < 0 ||
            index >= this.objects.length
        )
        {
            throw new Error(
                "UID hors limites : " +
                index
            );
        }
        if (
            this.cache.has(index)
        )
        {
            return this.cache.get(
                index
            );
        }
        if (
            this.resolving.has(index)
        )
        {
            return {
                "$circularUID": index
            };
        }
        const object =
            this.objects[index];
        if (
            object === "$null" ||
            object === null
        )
        {
            this.cache.set(
                index,
                null
            );
            return null;
        }
        this.resolving.add(
            index
        );
        let result;
        try
        {
            result =
                this.resolveObject(
                    object
                );
        }
        finally
        {
            this.resolving.delete(
                index
            );
        }
        this.cache.set(
            index,
            result
        );
        return result;
    }
    resolveObject(object)
    {
        if (isUID(object))
        {
            return this.resolveIndex(
                object.uid
            );
        }
        if (Array.isArray(object))
        {
            return object.map(
                value =>
                    this.resolveObject(
                        value
                    )
            );
        }
        if (
            object === null ||
            typeof object !== "object"
        )
        {
            return object;
        }
        if (
            object["NS.data"] instanceof
            Uint8Array
        )
        {
            return object["NS.data"];
        }
        if (
            object["NSRangeCount"] !==
            undefined &&
            object["NSRangeData"] !==
            undefined
        )
        {
            return {
                type: "NSIndexSet",
                count:
                    object["NSRangeCount"],
                rangeData:
                    this.resolveObject(
                        object["NSRangeData"]
                    )
            };
        }
        if (
            Array.isArray(
                object["NS.keys"]
            ) &&
            Array.isArray(
                object["NS.objects"]
            )
        )
        {
            const dictionary = {};
            const keys =
                object["NS.keys"];
            const values =
                object["NS.objects"];
            for (
                let i = 0;
                i < keys.length;
                i++
            )
            {
                const key =
                    this.resolveObject(
                        keys[i]
                    );
                const value =
                    this.resolveObject(
                        values[i]
                    );
                dictionary[key] =
                    value;
            }
            return dictionary;
        }
        const result = {};
        for (
            const key of Object.keys(
                object
            )
        )
        {
            if (key === "$class")
            {
                continue;
            }
            result[key] =
                this.resolveObject(
                    object[key]
                );
        }
        return result;
    }
    root()
    {
        if (this.rootObject)
        {
            console.log("Racine NSKeyedArchiver : dictionnaire NS.keys/NS.objects");
            return this.resolveObject(this.rootObject);
        }
        const top = this.plist["$top"];
        if (!top)
        {
            throw new Error("$top absent.");
        }
        const rootUID = top["root"];
        if (!rootUID)
        {
            throw new Error("root absent dans $top.");
        }
        console.log("UID racine :", rootUID.uid);
        return this.resolveUID(rootUID);
    }
}
function decodeGrilleArchive(
    decoded
)
{
    console.log(
        "================================"
    );
    console.log(
        "DECODAGE BINARY PLIST"
    );
    console.log(
        "Taille :",
        decoded.length
    );
    const decoder =
        new BinaryPlistDecoder(
            decoded
        );
    const plist =
        decoder.decode();
    window.lastPlist =
        plist;
    window.lastPlistDecoder =
        decoder;
    console.log(
        "Plist décodé :",
        plist
    );
    console.log(
        "Clés plist racine :",
        Object.keys(plist)
    );
    if (!plist || !Array.isArray(plist["NS.keys"]) || !Array.isArray(plist["NS.objects"]))
    {
        throw new Error("Racine NSKeyedArchiver invalide.");
    }
    console.log("Racine NSKeyedArchiver détectée.");
    const resolver =
        new KeyedArchiveResolver(
            plist,
            decoder.objects
        );
    window.lastArchiveResolver =
        resolver;
    const root =
        resolver.root();
    window.lastArchiveRoot =
        root;
    console.log(
        "OBJET RACINE NSKEYEDARCHIVER :",
        root
    );
    return root;
}
function extractGrilleData(root)
{
    console.log(
        "================================"
    );
    console.log(
        "EXTRACTION DONNÉES GRILLE"
    );
    if (!root || typeof root !== "object")
    {
        throw new Error(
            "Objet racine NSKeyedArchiver invalide."
        );
    }
    console.log(
        "Type root :",
        typeof root
    );
    console.log(
        "Clés root :",
        Object.keys(root)
    );
    const result =
        root;
    const expectedKeys =
    [
        "GRILLE",
        "COULEUR",
        "PALETTE",
        "ENCOURS",
        "TILESIZE",
        "TILEORIGIN"
    ];
    for (
        const key of expectedKeys
    )
    {
        if (
            Object.prototype.hasOwnProperty.call(
                result,
                key
            )
        )
        {
            console.log(
                key + " :",
                result[key]
            );
        }
        else
        {
            console.warn(
                "Clé absente :",
                key
            );
        }
    }
    console.log(
        "================================"
    );
    return result;
}
async function loadGrilleFile(
    file
)
{
    console.log(
        "==============================="
    );
    console.log(
        "OUVERTURE GRILLE"
    );
    console.log(
        "Nom :",
        file.name
    );
    console.log(
        "Taille fichier :",
        file.size
    );
    console.log(
        "Type :",
        file.type
    );
    console.log(
        "==============================="
    );
    if (!lzfseModule)
    {
        throw new Error(
            "Le module LZFSE n'est pas prêt."
        );
    }
    const buffer =
        await file.arrayBuffer();
    const bytes =
        new Uint8Array(
            buffer
        );
    console.log(
        "Buffer reçu :",
        bytes.length,
        "octets"
    );
    if (
        bytes.length < 8
    )
    {
        throw new Error(
            "Fichier .grille trop court."
        );
    }
    const view =
        new DataView(
            buffer
        );
    const originalSizeBig =
        view.getBigUint64(
            0,
            true
        );
    const originalSize =
        Number(
            originalSizeBig
        );
    console.log(
        "Taille originale annoncée :",
        originalSize
    );
    if (
        !Number.isSafeInteger(
            originalSize
        ) ||
        originalSize <= 0
    )
    {
        throw new Error(
            "Taille originale invalide."
        );
    }
    const compressed =
        bytes.subarray(
            8
        );
    console.log(
        "Taille LZFSE :",
        compressed.length
    );
    if (
        compressed.length >= 4
    )
    {
        const signature =
            String.fromCharCode(
                compressed[0],
                compressed[1],
                compressed[2],
                compressed[3]
            );
        console.log(
            "Signature LZFSE :",
            signature
        );
        if (
            signature !== "bvx2"
        )
        {
            console.warn(
                "Signature LZFSE inattendue :",
                signature
            );
        }
    }
    const decoded =
        await decompressLZFSE(
            compressed,
            originalSize
        );
    console.log(
        "Décompression terminée :",
        decoded.length,
        "octets"
    );
    window.lastDecodedGrille =
        decoded;
    const root =
        decodeGrilleArchive(
            decoded
        );
    const grilleData =
        extractGrilleData(
            root
        );
    window.lastGrilleArchive =
        grilleData;
    console.log(
        "================================"
    );
    console.log(
        "ARCHIVE GRILLE"
    );
    console.log(
        "GRILLE :",
        grilleData.GRILLE
    );
    console.log(
        "COULEUR :",
        grilleData.COULEUR
    );
    console.log(
        "PALETTE :",
        grilleData.PALETTE
    );
    console.log(
        "ENCOURS :",
        grilleData.ENCOURS
    );
    console.log(
        "TILESIZE :",
        grilleData.TILESIZE
    );
    console.log(
        "TILEORIGIN :",
        grilleData.TILEORIGIN
    );
    console.log(
        "================================"
    );
    if (
        grilleData.GRILLE instanceof
        Uint8Array
    )
    {
        sourceImage =
            await imageFromBytes(
                grilleData.GRILLE
            );
    }
    if (
        grilleData.COULEUR instanceof
        Uint8Array
    )
    {
        colorImage =
            await imageFromBytes(
                grilleData.COULEUR
            );
    }
    if (
        grilleData.PALETTE instanceof
        Uint8Array
    )
    {
        paletteImage =
            await imageFromBytes(
                grilleData.PALETTE
            );
    }
    if (
        typeof grilleData.TILESIZE ===
        "number"
    )
    {
        tileSize =
            Math.max(
                2,
                grilleData.TILESIZE * 2
            );
        const tileSizeInput =
            document.getElementById(
                "tileSize"
            );
        if (tileSizeInput)
        {
            tileSizeInput.value =
                tileSize;
        }
    }
    selectedTiles =
        decodeNSIndexSet(
            grilleData.ENCOURS
        );
    console.log(
        "Cases sélectionnées :",
        selectedTiles.size
    );
    recomputeGrid();
    draw();
    const info =
        document.getElementById(
            "info"
        );
    if (info)
    {
        info.textContent =
            sourceImage
                ? sourceImage.width +
                  " × " +
                  sourceImage.height +
                  " — " +
                  cols +
                  " × " +
                  rows
                : "Grille chargée";
    }
    console.log(
        "GRILLE CHARGÉE"
    );
    console.log(
        "================================"
    );
}
function imageFromBytes(
    bytes
)
{
    return new Promise(
        function (resolve, reject)
        {
            const blob =
                new Blob(
                    [bytes],
                    {
                        type: "image/png"
                    }
                );
            const url =
                URL.createObjectURL(
                    blob
                );
            const image =
                new Image();
            image.onload =
                function ()
                {
                    URL.revokeObjectURL(
                        url
                    );
                    resolve(
                        image
                    );
                };
            image.onerror =
                function ()
                {
                    URL.revokeObjectURL(
                        url
                    );
                    reject(
                        new Error(
                            "Impossible de décoder l'image PNG."
                        )
                    );
                };
            image.src =
                url;
        }
    );
}
function decodeNSIndexSet(value) {
    const result = new Set();
    if (!value) return result;
    if (Array.isArray(value)) {
        for (const index of value) {
            if (Number.isInteger(index)) result.add(index);
        }
        return result;
    }
    if (value.type !== "NSIndexSet") {
        console.warn("Objet NSIndexSet inattendu :", value);
        return result;
    }
    const data = value.rangeData;
    if (!(data instanceof Uint8Array)) {
        console.warn("NSRangeData absent.");
        return result;
    }
    function decodePackedUInt(bytes, offset) {
        let first = bytes[offset++];
        if (first < 128) {
            return { value: first, nextOffset: offset };
        }
        let value = first - 128;
        let multiplier = 128;
        while (offset < bytes.length) {
            const byte = bytes[offset++];
            if (byte < 128) {
                value += multiplier * byte;
                return { value: value, nextOffset: offset };
            }
            value += multiplier * (byte - 128);
            multiplier *= 128;
        }
        throw new Error(
            "NSRangeData tronqué pendant le décodage PackedUIntSequence."
        );
    }
    const integers = [];
    let offset = 0;
    while (offset < data.length) {
        const decoded = decodePackedUInt(data, offset);
        integers.push(decoded.value);
        offset = decoded.nextOffset;
    }
    const expectedIntegerCount = value.count * 2;
    if (integers.length !== expectedIntegerCount) {
        console.warn(
            "Nombre d'entiers inattendu :",
            integers.length,
            "attendu :",
            expectedIntegerCount
        );
    }
    for (let i = 0; i + 1 < integers.length; i += 2) {
        const location = integers[i];
        const length = integers[i + 1];
        if (length <= 0) continue;
        for (let j = 0; j < length; j++) {
            result.add(location + j);
        }
    }
    console.log(
        "NSIndexSet :",
        value.count,
        "plages,",
        result.size,
        "cases sélectionnées"
    );
    return result;
}
async function loadImageFile(
    file
)
{
    console.log(
        "Chargement image :",
        file.name
    );
    const url =
        URL.createObjectURL(
            file
        );
    const image =
        new Image();
    image.onload =
        function ()
        {
            URL.revokeObjectURL(
                url
            );
            sourceImage =
                image;
            colorImage =
                null;
            paletteImage =
                null;
            selectedTiles =
                new Set();
            recomputeGrid();
            draw();
            const info =
                document.getElementById(
                    "info"
                );
            if (info)
            {
                info.textContent =
                    image.width +
                    " × " +
                    image.height +
                    " — " +
                    cols +
                    " × " +
                    rows;
            }
            console.log(
                "Image chargée :",
                image.width,
                "x",
                image.height
            );
        };
    image.onerror =
        function ()
        {
            URL.revokeObjectURL(
                url
            );
            alert(
                "Impossible de charger l'image."
            );
        };
    image.src =
        url;
}
function recomputeGrid() {
    if (!sourceImage) {
        cols = 0;
        rows = 0;
        return;
    }
    cols = Math.ceil(sourceImage.naturalWidth / tileSize);
    rows = Math.ceil(sourceImage.naturalHeight / tileSize);
    resizeCanvasToGrid();
    resetCamera();
}
function resizeCanvasToGrid() {
    if (!canvas || cols <= 0 || rows <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const worldWidth = cols * tileSize;
    const worldHeight = rows * tileSize;
    canvas.width = Math.max(1, Math.round(worldWidth * dpr));
    canvas.height = Math.max(1, Math.round(worldHeight * dpr));
    canvas.style.width = worldWidth + "px";
    canvas.style.height = worldHeight + "px";
    canvas.style.transformOrigin = "0 0";
    applyCamera();
}
function getViewportSize() {
    if (!workspace) {
        return {
            width: window.innerWidth,
            height: window.innerHeight
        };
    }
    const rect = workspace.getBoundingClientRect();
    return {
        width: rect.width,
        height: rect.height
    };
}
function resetCamera() {
    if (!canvas || cols <= 0 || rows <= 0) {
        zoomFactor = 1;
        panX = 0;
        panY = 0;
        applyCamera();
        return;
    }
    const viewport = getViewportSize();
    const worldWidth = cols * tileSize;
    const worldHeight = rows * tileSize;
    if (worldWidth <= 0 || worldHeight <= 0 ||
        viewport.width <= 0 || viewport.height <= 0) {
        zoomFactor = 1;
        panX = 0;
        panY = 0;
        applyCamera();
        return;
    }
    const margin = 20;
    const availableWidth = Math.max(1, viewport.width - margin * 2);
    const availableHeight = Math.max(1, viewport.height - margin * 2);
    zoomFactor = Math.min(
        availableWidth / worldWidth,
        availableHeight / worldHeight
    );
    zoomFactor = clampZoom(zoomFactor);
    panX = (viewport.width - worldWidth * zoomFactor) * 0.5;
    panY = (viewport.height - worldHeight * zoomFactor) * 0.5;
    applyCamera();
}
function applyCamera() {
    if (!canvas) return;
    canvas.style.transformOrigin = "0 0";
    canvas.style.transform =
        "translate(" + panX + "px, " + panY + "px) " +
        "scale(" + zoomFactor + ")";
}
function updateCanvasTransform() {
    applyCamera();
}
function canvasPointFromClient(clientX, clientY) {
    const rect = workspace.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    return {
        x: (screenX - panX) / zoomFactor,
        y: (screenY - panY) / zoomFactor
    };
}
function worldPointToScreen(x, y) {
    return {
        x: panX + x * zoomFactor,
        y: panY + y * zoomFactor
    };
}
function clampZoom(value) {
    return Math.max(0.05, Math.min(10.0, value));
}
function handleWorkspaceResize() {
    if (!canvas || cols <= 0 || rows <= 0) return;
    const viewport = getViewportSize();
    const centerScreenX = viewport.width * 0.5;
    const centerScreenY = viewport.height * 0.5;
    const centerWorldX =
        (centerScreenX - panX) / zoomFactor;
    const centerWorldY =
        (centerScreenY - panY) / zoomFactor;
    panX = centerScreenX - centerWorldX * zoomFactor;
    panY = centerScreenY - centerWorldY * zoomFactor;
    applyCamera();
}
function tileIndexForPoint(x, y) {
    const col = Math.floor(x / tileSize);
    const row = Math.floor(y / tileSize);
    if (col < 0 || col >= cols || row < 0 || row >= rows) {
        return -1;
    }
    return row * cols + col;
}
function toggleTileAt(x, y) {
    const index = tileIndexForPoint(x, y);
    if (index < 0) return;
    if (selectedTiles.has(index)) {
        selectedTiles.delete(index);
    } else {
        selectedTiles.add(index);
    }
    draw();
}
function selectTileAt(x, y) {
    const index = tileIndexForPoint(x, y);
    if (index < 0) return;
    if (!selectedTiles.has(index)) {
        selectedTiles.add(index);
        draw();
    }
}
function pointerScreenPoint(event) {
    const rect = workspace.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}
function pointerWorldPoint(event) {
    return canvasPointFromClient(event.clientX, event.clientY);
}
function distanceBetweenPointers(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
}
function centerBetweenPointers(a, b) {
    return {
        x: (a.x + b.x) * 0.5,
        y: (a.y + b.y) * 0.5
    };
}
function setupPinch() {
    const pointers = Array.from(activePointers.values());
    if (pointers.length !== 2) return;
    lastPinchDistance =
        distanceBetweenPointers(pointers[0], pointers[1]);
    lastPinchCenter =
        centerBetweenPointers(pointers[0], pointers[1]);
    pinchActive = true;
}
function handlePointerDown(event) {
    if (!sourceImage) return;
    event.preventDefault();
    try {
        workspace.setPointerCapture(event.pointerId);
    } catch (_) {}
    const screen = pointerScreenPoint(event);
    activePointers.set(event.pointerId, {
        id: event.pointerId,
        pointerType: event.pointerType,
        x: screen.x,
        y: screen.y
    });
    if (activePointers.size === 1) {
        singlePointerId = event.pointerId;
        singlePointerMoved = false;
        singlePointerWorld = pointerWorldPoint(event);
        pinchActive = false;
        if (event.pointerType !== "touch") {
            toggleTileAt(
                singlePointerWorld.x,
                singlePointerWorld.y
            );
        }
        return;
    }
    if (activePointers.size === 2) {
        singlePointerMoved = true;
        setupPinch();
    }
}
function handlePointerMove(event) {
    const pointer = activePointers.get(event.pointerId);
    if (!pointer || !sourceImage) return;
    event.preventDefault();
    const screen = pointerScreenPoint(event);
    pointer.x = screen.x;
    pointer.y = screen.y;
    if (activePointers.size >= 2) {
        const pointers = Array.from(activePointers.values());
        const a = pointers[0];
        const b = pointers[1];
        const distance = distanceBetweenPointers(a, b);
        const center = centerBetweenPointers(a, b);
        if (lastPinchDistance > 0 && lastPinchCenter) {
            const worldX =
                (lastPinchCenter.x - panX) / zoomFactor;
            const worldY =
                (lastPinchCenter.y - panY) / zoomFactor;
            let newZoom =
                zoomFactor * (distance / lastPinchDistance);
            newZoom = clampZoom(newZoom);
            panX = center.x - worldX * newZoom;
            panY = center.y - worldY * newZoom;
            zoomFactor = newZoom;
            applyCamera();
        }
        lastPinchDistance = distance;
        lastPinchCenter = center;
        pinchActive = true;
        return;
    }
    if (activePointers.size !== 1 ||
        event.pointerId !== singlePointerId) {
        return;
    }
    const world = pointerWorldPoint(event);
    if (singlePointerWorld) {
        const dx = world.x - singlePointerWorld.x;
        const dy = world.y - singlePointerWorld.y;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            singlePointerMoved = true;
        }
    }
    singlePointerWorld = world;
    if (event.pointerType === "touch" || event.buttons !== 0) {
        selectTileAt(world.x, world.y);
    }
}
function handlePointerUp(event) {
    const pointer = activePointers.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    const wasTouch = pointer.pointerType === "touch";
    if (wasTouch &&
        activePointers.size === 1 &&
        event.pointerId === singlePointerId &&
        !singlePointerMoved &&
        !pinchActive) {
        const world = pointerWorldPoint(event);
        toggleTileAt(world.x, world.y);
    }
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) {
        lastPinchDistance = 0;
        lastPinchCenter = null;
    }
    if (activePointers.size === 1) {
        const remaining =
            Array.from(activePointers.values())[0];
        singlePointerId = remaining.id;
        singlePointerMoved = true;
        pinchActive = false;
        singlePointerWorld = {
            x: (remaining.x - panX) / zoomFactor,
            y: (remaining.y - panY) / zoomFactor
        };
    }
    if (activePointers.size === 0) {
        singlePointerId = null;
        singlePointerMoved = false;
        singlePointerWorld = null;
        pinchActive = false;
    }
    try {
        workspace.releasePointerCapture(event.pointerId);
    } catch (_) {}
}
function handlePointerCancel(event) {
    event.preventDefault();
    activePointers.delete(event.pointerId);
    lastPinchDistance = 0;
    lastPinchCenter = null;
    pinchActive = false;
    if (activePointers.size === 0) {
        singlePointerId = null;
        singlePointerMoved = false;
        singlePointerWorld = null;
    } else if (activePointers.size === 1) {
        const remaining =
            Array.from(activePointers.values())[0];
        singlePointerId = remaining.id;
        singlePointerMoved = true;
        singlePointerWorld = {
            x: (remaining.x - panX) / zoomFactor,
            y: (remaining.y - panY) / zoomFactor
        };
    }
    try {
        workspace.releasePointerCapture(event.pointerId);
    } catch (_) {}
}
function handleTrackpadWheel(event) {
    if (!sourceImage) return;
    event.preventDefault();
    const rect = workspace.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    if (event.ctrlKey) {
        const worldX =
            (screenX - panX) / zoomFactor;
        const worldY =
            (screenY - panY) / zoomFactor;
        const factor =
            Math.exp(-event.deltaY * 0.01);
        const newZoom =
            clampZoom(zoomFactor * factor);
        panX = screenX - worldX * newZoom;
        panY = screenY - worldY * newZoom;
        zoomFactor = newZoom;
        applyCamera();
        return;
    }
    panX -= event.deltaX;
    panY -= event.deltaY;
    applyCamera();
}
function draw() {
    if (!canvas || !ctx) return;
    const worldWidth = cols * tileSize;
    const worldHeight = rows * tileSize;
    if (worldWidth <= 0 || worldHeight <= 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(
        0,
        0,
        worldWidth,
        worldHeight
    );
    if (sourceImage) {
        ctx.drawImage(
            sourceImage,
            0,
            0,
            worldWidth,
            worldHeight
        );
    }
    if (selectedTiles.size > 0) {
        if (colorImage) {
            for (const index of selectedTiles) {
                if (index < 0 || index >= cols * rows) continue;
                const row = Math.floor(index / cols);
                const col = index % cols;
                const x = col * tileSize;
                const y = row * tileSize;
                ctx.drawImage(
                    colorImage,
                    x,
                    y,
                    tileSize,
                    tileSize,
                    x,
                    y,
                    tileSize,
                    tileSize
                );
            }
        } else {
            ctx.fillStyle = "rgba(255, 0, 0, 0.35)";
            for (const index of selectedTiles) {
                if (index < 0 || index >= cols * rows) continue;
                const row = Math.floor(index / cols);
                const col = index % cols;
                ctx.fillRect(
                    col * tileSize,
                    row * tileSize,
                    tileSize,
                    tileSize
                );
            }
        }
    }
    ctx.beginPath();
    ctx.lineWidth = 1 / Math.max(zoomFactor, 0.0001);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    for (let col = 0; col <= cols; col++) {
        const x = col * tileSize + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, worldHeight);
    }
    for (let row = 0; row <= rows; row++) {
        const y = row * tileSize + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(worldWidth, y);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.lineWidth = 1 / Math.max(zoomFactor, 0.0001);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.rect(
        0.5,
        0.5,
        worldWidth - 1,
        worldHeight - 1
    );
    ctx.stroke();
}
function clearSelection() {
    selectedTiles.clear();
    draw();
    console.log("Sélection effacée.");
}
