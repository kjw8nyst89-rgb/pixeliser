import createLZFSEModule from "./lzfse/lzfse.js";


// ============================================================
// VARIABLES GLOBALES
// ============================================================

let lzfseModule = null;

let sourceImage = null;
let colorImage = null;
let paletteImage = null;

let canvas = null;
let ctx = null;

let cols = 0;
let rows = 0;

let tileSize = 20;

let selectedTiles = new Set();

let zoomFactor = 1.0;

let lastTouchDistance = 0;
let touchStartX = 0;
let touchStartY = 0;

let isDragging = false;


// ============================================================
// INITIALISATION
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    async function ()
    {
        console.log("Pixeliser démarrage...");

        canvas =
            document.getElementById("canvas");

        if (!canvas)
        {
            console.error(
                "Canvas introuvable."
            );

            return;
        }

        ctx =
            canvas.getContext("2d");

        if (!ctx)
        {
            console.error(
                "Impossible de créer le contexte 2D."
            );

            return;
        }


        // ----------------------------------------------------
        // Boutons
        // ----------------------------------------------------

        const openButton =
            document.getElementById(
                "openButton"
            );

        const openGrilleButton =
            document.getElementById(
                "openGrilleButton"
            );

        const clearButton =
            document.getElementById(
                "clearButton"
            );

        const imageInput =
            document.getElementById(
                "imageInput"
            );

        const grilleInput =
            document.getElementById(
                "grilleInput"
            );

        const tileSizeInput =
            document.getElementById(
                "tileSize"
            );


        if (openButton)
        {
            openButton.addEventListener(
                "click",
                function ()
                {
                    imageInput.click();
                }
            );
        }


        if (imageInput)
        {
            imageInput.addEventListener(
                "change",
                function (event)
                {
                    const file =
                        event.target.files[0];

                    if (file)
                    {
                        loadImageFile(
                            file
                        );
                    }
                }
            );
        }


        if (openGrilleButton)
        {
            openGrilleButton.addEventListener(
                "click",
                function ()
                {
                    grilleInput.click();
                }
            );
        }


        if (grilleInput)
        {
            grilleInput.addEventListener(
                "change",
                async function (event)
                {
                    const file =
                        event.target.files[0];

                    if (!file)
                    {
                        return;
                    }

                    try
                    {
                        await loadGrilleFile(
                            file
                        );
                    }
                    catch (error)
                    {
                        console.error(
                            "Erreur lecture grille :",
                            error
                        );

                        alert(
                            "Erreur lecture grille :\n" +
                            error.message
                        );
                    }
                }
            );
        }


        if (clearButton)
        {
            clearButton.addEventListener(
                "click",
                clearSelection
            );
        }


        if (tileSizeInput)
        {
            tileSizeInput.addEventListener(
                "change",
                function ()
                {
                    const value =
                        parseInt(
                            tileSizeInput.value,
                            10
                        );

                    if (
                        !Number.isFinite(value) ||
                        value < 2
                    )
                    {
                        return;
                    }

                    tileSize =
                        value;

                    recomputeGrid();

                    draw();
                }
            );
        }


        // ----------------------------------------------------
        // Touch
        // ----------------------------------------------------

        canvas.addEventListener(
            "touchstart",
            handleTouchStart,
            {
                passive: false
            }
        );

        canvas.addEventListener(
            "touchmove",
            handleTouchMove,
            {
                passive: false
            }
        );

        canvas.addEventListener(
            "touchend",
            handleTouchEnd,
            {
                passive: false
            }
        );


        // ----------------------------------------------------
        // LZFSE
        // ----------------------------------------------------

        try
        {
            await initializeLZFSE();
        }
        catch (error)
        {
            console.error(
                "LZFSE indisponible :",
                error
            );
        }
    }
);


// ============================================================
// LZFSE
// ============================================================

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


// ============================================================
// BINARY PLIST
// ============================================================

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


        // ----------------------------------------------------
        // Offsets
        // ----------------------------------------------------

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


        // ----------------------------------------------------
        // Objets
        // ----------------------------------------------------

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


// ============================================================
// NSKEYEDARCHIVER
// ============================================================

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
    constructor(plist)
    {
        this.plist =
            plist;

        this.objects =
            plist["$objects"];

        if (
            !Array.isArray(
                this.objects
            )
        )
        {
            throw new Error(
                "$objects absent ou invalide."
            );
        }


        this.cache =
            new Map();

        this.resolving =
            new Set();
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


        // ----------------------------------------------------
        // NSData
        // ----------------------------------------------------

        if (
            object["NS.data"] instanceof
            Uint8Array
        )
        {
            return object["NS.data"];
        }


        // ----------------------------------------------------
        // NSIndexSet
        // ----------------------------------------------------

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


        // ----------------------------------------------------
        // NSDictionary NSKeyedArchiver
        // ----------------------------------------------------

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


        // ----------------------------------------------------
        // Dictionnaire classique
        // ----------------------------------------------------

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
        const top =
            this.plist["$top"];


        if (!top)
        {
            throw new Error(
                "$top absent."
            );
        }


        const rootUID =
            top["root"];


        if (!rootUID)
        {
            throw new Error(
                "root absent dans $top."
            );
        }


        console.log(
            "UID racine :",
            rootUID.uid
        );


        return this.resolveUID(
            rootUID
        );
    }
}


// ============================================================
// DECODAGE ARCHIVE
// ============================================================

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


    if (
        plist["$archiver"] !==
        "NSKeyedArchiver"
    )
    {
        throw new Error(
            "Archive NSKeyedArchiver attendue."
        );
    }


    const resolver =
        new KeyedArchiveResolver(
            plist
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


// ============================================================
// EXTRACTION DES DONNEES GRILLE
// ============================================================

// ============================================================
// EXTRACTION DES DONNÉES DE LA GRILLE
// ============================================================

// ============================================================
// EXTRACTION DES DONNÉES DE LA GRILLE
// ============================================================

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


    // --------------------------------------------------------
    // IMPORTANT :
    //
    // decodeGrilleArchive() a déjà résolu le
    // NSDictionary NSKeyedArchiver.
    //
    // root EST donc directement le dictionnaire
    // contenant GRILLE, COULEUR, PALETTE, etc.
    // --------------------------------------------------------

    const result =
        root;


    // --------------------------------------------------------
    // Vérification
    // --------------------------------------------------------

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


// ============================================================
// OUVERTURE .GRILLE
// ============================================================

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


    // --------------------------------------------------------
    // Taille originale
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // Données LZFSE
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // Décompression
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // Binary plist + NSKeyedArchiver
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // Informations
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // Chargement des images
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // Taille des cases
    // --------------------------------------------------------

    if (
        typeof grilleData.TILESIZE ===
        "number"
    )
    {
        // Le fichier Mac stocke la taille historique.
        // L'interface iPad travaille avec une taille doublée.

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


    // --------------------------------------------------------
    // Cases cochées
    // --------------------------------------------------------

    selectedTiles =
        decodeNSIndexSet(
            grilleData.ENCOURS
        );


    console.log(
        "Cases sélectionnées :",
        selectedTiles.size
    );


    // --------------------------------------------------------
    // Affichage
    // --------------------------------------------------------

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

    console.log(
    "AVANT DRAW"
);

draw();

console.log(
    "APRÈS DRAW"
);
}


// ============================================================
// NSData -> IMAGE
// ============================================================
function imageFromBytes(bytes)
{
    return new Promise((resolve, reject) =>
    {
        console.log(
            "imageFromBytes : début, taille =",
            bytes ? bytes.length : null
        );

        if (!(bytes instanceof Uint8Array))
        {
            console.error(
                "imageFromBytes : ce n'est pas un Uint8Array",
                bytes
            );

            reject(
                new Error("Données image invalides")
            );

            return;
        }

        const blob =
            new Blob(
                [bytes],
                {
                    type: "image/png"
                }
            );

        console.log(
            "imageFromBytes : Blob créé",
            blob.size,
            blob.type
        );

        const url =
            URL.createObjectURL(blob);

        console.log(
            "imageFromBytes : URL",
            url
        );

        const img =
            new Image();

        img.onload = () =>
        {
            console.log(
                "imageFromBytes : IMAGE CHARGÉE",
                img.width,
                "x",
                img.height
            );

            URL.revokeObjectURL(url);

            resolve(img);
        };

        img.onerror = (event) =>
        {
            console.error(
                "imageFromBytes : ERREUR CHARGEMENT IMAGE",
                event
            );

            URL.revokeObjectURL(url);

            reject(
                new Error(
                    "Impossible de décoder le PNG"
                )
            );
        };

        img.src = url;
    });
}
function imageFromBytesOld(
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


// ============================================================
// NSINDEXSET
// ============================================================

function decodeNSIndexSet(value)
{
    const result =
        new Set();


    if (!value)
    {
        return result;
    }


    // --------------------------------------------------------
    // Cas simple : tableau d'indices
    // --------------------------------------------------------

    if (Array.isArray(value))
    {
        for (
            const index of value
        )
        {
            if (
                Number.isInteger(index)
            )
            {
                result.add(index);
            }
        }

        return result;
    }


    // --------------------------------------------------------
    // Vérification NSIndexSet
    // --------------------------------------------------------

    if (
        value.type !==
        "NSIndexSet"
    )
    {
        console.warn(
            "Objet NSIndexSet inattendu :",
            value
        );

        return result;
    }


    console.log(
        "NSIndexSet nombre de plages :",
        value.count
    );


    const data =
        value.rangeData;


    if (
        !(data instanceof Uint8Array)
    )
    {
        console.warn(
            "NSRangeData absent."
        );

        return result;
    }


    console.log(
        "NSRangeData taille :",
        data.length
    );


    // --------------------------------------------------------
    // PackedUIntSequence
    //
    // Apple encode les UInt en base 128.
    //
    // Si l'octet est < 128 :
    //      fin de l'entier
    //
    // Si l'octet est >= 128 :
    //      (octet - 128) est le chiffre courant
    //      l'octet suivant contient la suite
    //
    // Exemple :
    //
    // 48 02
    //
    // donne :
    //
    // 0x48 + 128 * 0x02
    // = 72 + 256
    // = 328
    //
    // --------------------------------------------------------

    function decodePackedUInt(
        bytes,
        offset
    )
    {
        let first =
            bytes[offset++];


        if (
            first < 128
        )
        {
            return {
                value: first,
                nextOffset: offset
            };
        }


        let value =
            first - 128;


        let multiplier =
            128;


        while (
            offset <
            bytes.length
        )
        {
            const byte =
                bytes[offset++];


            if (
                byte < 128
            )
            {
                value +=
                    multiplier *
                    byte;

                return {
                    value: value,
                    nextOffset: offset
                };
            }


            value +=
                multiplier *
                (byte - 128);


            multiplier *=
                128;
        }


        throw new Error(
            "NSRangeData tronqué pendant le décodage PackedUIntSequence."
        );
    }


    // --------------------------------------------------------
    // Décodage de tous les UInt
    // --------------------------------------------------------

    const integers =
        [];


    let offset =
        0;


    while (
        offset <
        data.length
    )
    {
        const decoded =
            decodePackedUInt(
                data,
                offset
            );


        integers.push(
            decoded.value
        );


        offset =
            decoded.nextOffset;
    }


    console.log(
        "PackedUIntSequence :",
        integers.length,
        "entiers"
    );


    // --------------------------------------------------------
    // Chaque plage = 2 entiers :
    //
    // location
    // length
    //
    // NSRangeCount = nombre de plages
    // --------------------------------------------------------

    const expectedIntegerCount =
        value.count * 2;


    if (
        integers.length !==
        expectedIntegerCount
    )
    {
        console.warn(
            "Nombre d'entiers inattendu :",
            integers.length,
            "attendu :",
            expectedIntegerCount
        );
    }


    // --------------------------------------------------------
    // Conversion des plages en indices individuels
    // --------------------------------------------------------

    let decodedCount =
        0;


    for (
        let i = 0;
        i + 1 < integers.length;
        i += 2
    )
    {
        const location =
            integers[i];


        const length =
            integers[i + 1];


        console.log(
            "NSIndexSet range :",
            location,
            "+",
            length
        );


        if (
            length <= 0
        )
        {
            continue;
        }


        for (
            let j = 0;
            j < length;
            j++
        )
        {
            result.add(
                location + j
            );
        }


        decodedCount +=
            length;
    }


    console.log(
        "NSIndexSet cases réellement sélectionnées :",
        decodedCount
    );


    console.log(
        "Set final :",
        result.size
    );

    return result;
}


// ============================================================
// IMAGE SIMPLE
// ============================================================

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


// ============================================================
// GRILLE
// ============================================================

function recomputeGrid()
{
    if (!sourceImage)
    {
        cols = 0;
        rows = 0;

        canvas.width = 1;
        canvas.height = 1;

        return;
    }


    cols =
        Math.ceil(
            sourceImage.width /
            tileSize
        );


    rows =
        Math.ceil(
            sourceImage.height /
            tileSize
        );


    canvas.width =
        cols * tileSize;


    canvas.height =
        rows * tileSize;


    console.log(
        "Grille :",
        cols,
        "x",
        rows,
        "cases"
    );
}


// ============================================================
// DESSIN
// ============================================================

function draw()
    
{
    console.log("========== DRAW ==========");

console.log(
    "canvas :",
    canvas
);

console.log(
    "canvas.width / height :",
    canvas.width,
    canvas.height
);

console.log(
    "canvas.clientWidth / clientHeight :",
    canvas.clientWidth,
    canvas.clientHeight
);

console.log(
    "sourceImage :",
    sourceImage
);

if (sourceImage)
{
    console.log(
        "sourceImage.width / height :",
        sourceImage.width,
        sourceImage.height
    );
}

console.log(
    "tileSize :",
    tileSize
);

console.log(
    "selectedTiles :",
    selectedTiles ? selectedTiles.size : null
);

const ctx =
    canvas.getContext("2d");

console.log(
    "context 2D :",
    ctx
);
    if (!ctx)
    {
        return;
    }


    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );
ctx.fillStyle = "red";

ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
);

    if (!sourceImage)
    {
        return;
    }


    // --------------------------------------------------------
    // Image
    // --------------------------------------------------------

    ctx.drawImage(
        sourceImage,
        0,
        0,
        canvas.width,
        canvas.height
    );


    // --------------------------------------------------------
    // Cases sélectionnées
    // --------------------------------------------------------

    ctx.save();


    for (
        const index of selectedTiles
    )
    {
        if (
            index < 0 ||
            index >= cols * rows
        )
        {
            continue;
        }


        const col =
            index % cols;


        const row =
            Math.floor(
                index / cols
            );


        const x =
            col * tileSize;


        const y =
            row * tileSize;


        ctx.fillStyle =
            "rgba(255, 0, 0, 0.35)";


        ctx.fillRect(
            x,
            y,
            tileSize,
            tileSize
        );
    }


    ctx.restore();


    // --------------------------------------------------------
    // Grille
    // --------------------------------------------------------

    ctx.save();


    ctx.strokeStyle =
        "rgba(0, 0, 0, 0.35)";


    ctx.lineWidth =
        1;


    ctx.beginPath();


    for (
        let col = 0;
        col <= cols;
        col++
    )
    {
        const x =
            col * tileSize +
            0.5;


        ctx.moveTo(
            x,
            0
        );


        ctx.lineTo(
            x,
            canvas.height
        );
    }


    for (
        let row = 0;
        row <= rows;
        row++
    )
    {
        const y =
            row * tileSize +
            0.5;


        ctx.moveTo(
            0,
            y
        );


        ctx.lineTo(
            canvas.width,
            y
        );
    }


    ctx.stroke();

    ctx.restore();
}


// ============================================================
// SELECTION
// ============================================================

function tileIndexForPoint(
    x,
    y
)
{
    const col =
        Math.floor(
            x / tileSize
        );


    const row =
        Math.floor(
            y / tileSize
        );


    if (
        col < 0 ||
        col >= cols ||
        row < 0 ||
        row >= rows
    )
    {
        return -1;
    }


    return (
        row * cols +
        col
    );
}


function toggleTileAt(
    x,
    y
)
{
    const index =
        tileIndexForPoint(
            x,
            y
        );


    if (index < 0)
    {
        return;
    }


    if (
        selectedTiles.has(
            index
        )
    )
    {
        selectedTiles.delete(
            index
        );
    }
    else
    {
        selectedTiles.add(
            index
        );
    }


    draw();
}


// ============================================================
// TOUCH
// ============================================================

function distanceBetweenTouches(
    touch1,
    touch2
)
{
    const dx =
        touch1.clientX -
        touch2.clientX;


    const dy =
        touch1.clientY -
        touch2.clientY;


    return Math.sqrt(
        dx * dx +
        dy * dy
    );
}


function canvasPointFromTouch(
    touch
)
{
    const rect =
        canvas.getBoundingClientRect();


    const scaleX =
        canvas.width /
        rect.width;


    const scaleY =
        canvas.height /
        rect.height;


    return {
        x:
            (touch.clientX -
             rect.left) *
            scaleX,

        y:
            (touch.clientY -
             rect.top) *
            scaleY
    };
}


function handleTouchStart(
    event
)
{
    event.preventDefault();


    if (
        event.touches.length === 2
    )
    {
        lastTouchDistance =
            distanceBetweenTouches(
                event.touches[0],
                event.touches[1]
            );

        isDragging =
            false;

        return;
    }


    if (
        event.touches.length === 1
    )
    {
        const touch =
            event.touches[0];


        const point =
            canvasPointFromTouch(
                touch
            );


        touchStartX =
            point.x;

        touchStartY =
            point.y;


        isDragging =
            true;


        toggleTileAt(
            point.x,
            point.y
        );
    }
}


function handleTouchMove(
    event
)
{
    event.preventDefault();


    if (
        event.touches.length === 2
    )
    {
        const distance =
            distanceBetweenTouches(
                event.touches[0],
                event.touches[1]
            );


        if (
            lastTouchDistance > 0
        )
        {
            const ratio =
                distance /
                lastTouchDistance;


            zoomFactor *=
                ratio;


            zoomFactor =
                Math.max(
                    0.25,
                    Math.min(
                        5.0,
                        zoomFactor
                    )
                );


            canvas.style.transform =
                "scale(" +
                zoomFactor +
                ")";


            lastTouchDistance =
                distance;
        }


        return;
    }


    if (
        event.touches.length === 1 &&
        isDragging
    )
    {
        const touch =
            event.touches[0];


        const point =
            canvasPointFromTouch(
                touch
            );


        const index =
            tileIndexForPoint(
                point.x,
                point.y
            );


        if (
            index >= 0 &&
            !selectedTiles.has(
                index
            )
        )
        {
            selectedTiles.add(
                index
            );

            draw();
        }
    }
}


function handleTouchEnd(
    event
)
{
    event.preventDefault();


    if (
        event.touches.length < 2
    )
    {
        lastTouchDistance =
            0;
    }


    if (
        event.touches.length === 0
    )
    {
        isDragging =
            false;
    }
}


// ============================================================
// EFFACER
// ============================================================

function clearSelection()
{
    selectedTiles.clear();

    draw();


    console.log(
        "Sélection effacée."
    );
}
