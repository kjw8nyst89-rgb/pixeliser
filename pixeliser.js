import createLZFSEModule from "./lzfse/lzfse.js";

const version = "V4"
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
let panX = 0;
let panY = 0;

let activePointers = new Map();
let singlePointer = null;
let singlePointerMoved = false;
let lastPointerWorldX = 0;
let lastPointerWorldY = 0;

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
        console.log("Version = ",version);

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
            document.getElementById("openButton");

        const imageInput =
            document.getElementById("imageInput");

        const openGrilleButton =
            document.getElementById("openGrilleButton");

        const grilleInput =
            document.getElementById("grilleInput");

        const clearButton =
            document.getElementById("clearButton");

        const tileSizeInput =
            document.getElementById("tileSize");


        if (openButton && imageInput)
        {
            openButton.addEventListener(
                "click",
                function ()
                {
                    imageInput.click();
                }
            );

            imageInput.addEventListener(
                "change",
                function ()
                {
                    if (imageInput.files &&
                        imageInput.files.length > 0)
                    {
                        loadImageFile(
                            imageInput.files[0]
                        );
                    }
                }
            );
        }


        if (openGrilleButton && grilleInput)
        {
            openGrilleButton.addEventListener(
                "click",
                function ()
                {
                    grilleInput.click();
                }
            );

            grilleInput.addEventListener(
                "change",
                async function ()
                {
                    if (grilleInput.files &&
                        grilleInput.files.length > 0)
                    {
                        try
                        {
                            await loadGrilleFile(
                                grilleInput.files[0]
                            );
                        }
                        catch (error)
                        {
                            console.error(
                                "Erreur chargement grille :",
                                error
                            );

                            alert(
                                "Erreur lors du chargement de la grille :\n" +
                                error.message
                            );
                        }
                    }
                }
            );
        }


        if (clearButton)
        {
            clearButton.addEventListener(
                "click",
                function ()
                {
                    clearAll();
                }
            );
        }


        if (tileSizeInput)
        {
            tileSizeInput.addEventListener(
                "change",
                function ()
                {
                    let value =
                        parseInt(
                            tileSizeInput.value,
                            10
                        );

                    if (!Number.isFinite(value))
                        value = 20;

                    value =
                        Math.max(
                            2,
                            Math.min(
                                100,
                                value
                            )
                        );

                    tileSizeInput.value =
                        String(value);

                    tileSize = value;

                    recomputeGrid();
                }
            );
        }


        // ----------------------------------------------------
        // Interactions souris / trackpad / tactile
        // ----------------------------------------------------

        const workspace =
            document.getElementById("workspace");

        if (workspace)
        {
            workspace.addEventListener(
                "pointerdown",
                handlePointerDown,
                { passive: false }
            );

            workspace.addEventListener(
                "pointermove",
                handlePointerMove,
                { passive: false }
            );

            workspace.addEventListener(
                "pointerup",
                handlePointerUp,
                { passive: false }
            );

            workspace.addEventListener(
                "pointercancel",
                handlePointerUp,
                { passive: false }
            );

            workspace.addEventListener(
                "wheel",
                handleTrackpadWheel,
                { passive: false }
            );
        }


        // ----------------------------------------------------
        // LZFSE
        // ----------------------------------------------------

        try
        {
            console.log(
                "Initialisation LZFSE..."
            );

            lzfseModule =
                await createLZFSEModule();

            console.log(
                "decode_lzfse_memfs :",
                typeof lzfseModule
                    ._decode_lzfse_memfs
            );

            if (!lzfseModule.FS)
            {
                throw new Error(
                    "FS Emscripten indisponible."
                );
            }

            console.log(
                "LZFSE prêt"
            );
        }
        catch (error)
        {
            console.error(
                "Impossible d'initialiser LZFSE :",
                error
            );

            alert(
                "Impossible d'initialiser LZFSE :\n" +
                error.message
            );
        }
    }
);


// ============================================================
// IMAGE
// ============================================================

function loadImageFile(file)
{
    if (!file)
        return;

    console.log(
        "Chargement image :",
        file.name
    );

    const reader =
        new FileReader();

    reader.onload =
        function (event)
        {
            const image =
                new Image();

            image.onload =
                function ()
                {
                    sourceImage =
                        image;

                    colorImage =
                        null;

                    paletteImage =
                        null;

                    selectedTiles.clear();

                    recomputeGrid();

                    updateInfo();

                    draw();
                };

            image.onerror =
                function ()
                {
                    console.error(
                        "Erreur chargement image."
                    );

                    alert(
                        "Impossible de charger l'image."
                    );
                };

            image.src =
                event.target.result;
        };

    reader.onerror =
        function ()
        {
            console.error(
                "Erreur FileReader."
            );

            alert(
                "Impossible de lire le fichier."
            );
        };

    reader.readAsDataURL(file);
}


// ============================================================
// GRILLE
// ============================================================

async function loadGrilleFile(file)
{
    if (!file)
        return;

    if (!lzfseModule)
    {
        throw new Error(
            "LZFSE n'est pas encore initialisé."
        );
    }

    console.log(
        "Chargement grille :",
        file.name
    );

    const buffer =
        await file.arrayBuffer();

    const bytes =
        new Uint8Array(buffer);

    if (bytes.length < 8)
    {
        throw new Error(
            "Fichier grille trop court."
        );
    }


    // --------------------------------------------------------
    // Les 8 premiers octets contiennent la taille originale
    // de l'archive NSKeyedArchiver décompressée.
    //
    // uint64 little endian.
    // --------------------------------------------------------

    const expectedSize =
        readUInt64LE(bytes, 0);

    console.log(
        "Taille originale annoncée :",
        expectedSize
    );


    const compressed =
        bytes.slice(8);

    console.log(
        "Taille LZFSE :",
        compressed.length
    );


    if (compressed.length >= 4)
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
            JSON.stringify(signature)
        );
    }


    if (expectedSize <= 0 ||
        expectedSize > 1024 * 1024 * 1024)
    {
        throw new Error(
            "Taille décompressée invalide : " +
            expectedSize
        );
    }


    // --------------------------------------------------------
    // MEMFS
    // --------------------------------------------------------

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
    catch (_) {}


    try
    {
        lzfseModule.FS.unlink(
            outputPath
        );
    }
    catch (_) {}


    console.log(
        "Décompression LZFSE via MEMFS..."
    );


    lzfseModule.FS.createDataFile(
        "/",
        "grille_input.lzfse",
        compressed,
        true,
        true
    );


    console.log(
        "Fichier MEMFS créé :",
        inputPath
    );


    console.log(
        "Appel decode_lzfse_memfs..."
    );


    const result =
        lzfseModule._decode_lzfse_memfs(
            expectedSize
        );


    console.log(
        "Résultat decode_lzfse_memfs :",
        result
    );


    let decoded;

    try
    {
        decoded =
            lzfseModule.FS.readFile(
                outputPath
            );
    }
    catch (error)
    {
        throw new Error(
            "Impossible de lire la sortie LZFSE : " +
            error.message
        );
    }


    console.log(
        "Archive décompressée :",
        decoded.length,
        "octets"
    );


    if (decoded.length !== expectedSize)
    {
        console.warn(
            "Taille obtenue différente de la taille annoncée :",
            decoded.length,
            expectedSize
        );
    }


    const archive =
        decodeBinaryPlist(decoded);


    console.log(
        "Archive plist décodée :",
        archive
    );


    const grilleData =
        decodeGrilleArchive(archive);


    console.log(
        "Archive résolue :",
        grilleData
    );


    await applyGrilleData(
        grilleData
    );
}


// ============================================================
// UINT64 LITTLE ENDIAN
// ============================================================

function readUInt64LE(bytes, offset)
{
    const low =
        bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24);

    const high =
        bytes[offset + 4] |
        (bytes[offset + 5] << 8) |
        (bytes[offset + 6] << 16) |
        (bytes[offset + 7] << 24);

    return (
        low >>> 0
    ) +
    (
        (high >>> 0) *
        4294967296
    );
}


// ============================================================
// APPLICATION DES DONNÉES DE GRILLE
// ============================================================

async function applyGrilleData(data)
{
    if (!data)
    {
        throw new Error(
            "Données de grille absentes."
        );
    }


    console.log(
        "GRILLE :",
        data.GRILLE
    );

    console.log(
        "COULEUR :",
        data.COULEUR
    );

    console.log(
        "PALETTE :",
        data.PALETTE
    );

    console.log(
        "ENCOURS :",
        data.ENCOURS
    );

    console.log(
        "TILESIZE :",
        data.TILESIZE
    );

    console.log(
        "TILEORIGIN :",
        data.TILEORIGIN
    );


    if (!(data.GRILLE instanceof Uint8Array))
    {
        throw new Error(
            "Données PNG GRILLE invalides."
        );
    }


    const grilleBlob =
        new Blob(
            [data.GRILLE],
            { type: "image/png" }
        );


    const grilleURL =
        URL.createObjectURL(
            grilleBlob
        );


    const grilleImage =
        await loadImageURL(
            grilleURL
        );


    URL.revokeObjectURL(
        grilleURL
    );


    sourceImage =
        grilleImage;


    if (data.COULEUR instanceof Uint8Array)
    {
        const couleurBlob =
            new Blob(
                [data.COULEUR],
                { type: "image/png" }
            );

        const couleurURL =
            URL.createObjectURL(
                couleurBlob
            );

        try
        {
            colorImage =
                await loadImageURL(
                    couleurURL
                );
        }
        finally
        {
            URL.revokeObjectURL(
                couleurURL
            );
        }
    }
    else
    {
        colorImage =
            null;
    }


    if (data.PALETTE instanceof Uint8Array)
    {
        const paletteBlob =
            new Blob(
                [data.PALETTE],
                { type: "image/png" }
            );

        const paletteURL =
            URL.createObjectURL(
                paletteBlob
            );

        try
        {
            paletteImage =
                await loadImageURL(
                    paletteURL
                );
        }
        finally
        {
            URL.revokeObjectURL(
                paletteURL
            );
        }
    }
    else
    {
        paletteImage =
            null;
    }


    // --------------------------------------------------------
    // TILESIZE
    //
    // Les fichiers Mac utilisent la moitié de la taille
    // affichée par l'application iPad/Web.
    // --------------------------------------------------------

    if (typeof data.TILESIZE === "number")
    {
        tileSize =
            Math.max(
                2,
                Math.round(
                    data.TILESIZE * 2
                )
            );
    }


    const tileSizeInput =
        document.getElementById(
            "tileSize"
        );

    if (tileSizeInput)
    {
        tileSizeInput.value =
            String(tileSize);
    }


    // --------------------------------------------------------
    // Nombre de colonnes / lignes
    // --------------------------------------------------------

    cols =
        Math.floor(
            sourceImage.width /
            tileSize
        );

    rows =
        Math.floor(
            sourceImage.height /
            tileSize
        );


    selectedTiles.clear();


    // --------------------------------------------------------
    // NSIndexSet
    // --------------------------------------------------------

    if (data.ENCOURS &&
        data.ENCOURS.type === "NSIndexSet")
    {
        const indexes =
            decodeNSIndexSet(
                data.ENCOURS
            );

        const origin =
            Number(data.TILEORIGIN || 0);


        for (const index of indexes)
        {
            let finalIndex =
                index;

            if (!origin)
            {
                const macRow =
                    Math.floor(
                        index / cols
                    );

                const col =
                    index % cols;

                const ipadRow =
                    rows -
                    1 -
                    macRow;

                if (ipadRow >= 0 &&
                    ipadRow < rows)
                {
                    finalIndex =
                        ipadRow * cols +
                        col;
                }
            }


            if (finalIndex >= 0 &&
                finalIndex < cols * rows)
            {
                selectedTiles.add(
                    finalIndex
                );
            }
        }
    }


    recomputeGrid();

    updateInfo();

    draw();
}


// ============================================================
// CHARGEMENT IMAGE DEPUIS URL
// ============================================================

function loadImageURL(url)
{
    return new Promise(
        function (resolve, reject)
        {
            const image =
                new Image();

            image.onload =
                function ()
                {
                    resolve(image);
                };

            image.onerror =
                function ()
                {
                    reject(
                        new Error(
                            "Données PNG invalides."
                        )
                    );
                };

            image.src =
                url;
        }
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
    // root EST déjà le NSDictionary résolu.
    // --------------------------------------------------------

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
}


// ============================================================
// NSData -> IMAGE
// ============================================================

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
    // Décodage des UInt
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


    // --------------------------------------------------------
    // Réinitialisation de la caméra
    // --------------------------------------------------------

    zoomFactor = 1.0;
    panX = 0;
    panY = 0;


    canvas.style.transformOrigin =
        "0 0";


    canvas.style.transform =
        "translate(0px, 0px) scale(1)";


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


    if (!sourceImage)
    {
        return;
    }


    // --------------------------------------------------------
    // Image originale
    //
    // IMPORTANT :
    // on conserve sourceImage ici.
    // colorImage ne doit PAS remplacer l'image affichée.
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


    // Lignes verticales

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


    // Lignes horizontales

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
// COORDONNEES ECRAN -> GRILLE
// ============================================================

function canvasPointFromClient(
    clientX,
    clientY
)
{
    const workspace =
        document.getElementById(
            "workspace"
        );


    const rect =
        workspace
            ? workspace.getBoundingClientRect()
            : canvas.getBoundingClientRect();


    return {
        x:
            (
                clientX -
                rect.left -
                panX
            ) /
            zoomFactor,

        y:
            (
                clientY -
                rect.top -
                panY
            ) /
            zoomFactor
    };
}


// ============================================================
// POINTER EVENTS
//
// Mac souris : clic / clic-drag
//
// iPad :
//      1 doigt  = sélection / sélection par glissement
//      2 doigts = déplacement + zoom
//
// IMPORTANT :
// On utilise Pointer Events uniquement.
// Les anciens Touch Events ne sont plus enregistrés.
// ============================================================

function handlePointerDown(
    event
)
{
    event.preventDefault();


    const workspace =
        document.getElementById(
            "workspace"
        );


    // --------------------------------------------------------
    // Capture du doigt sur iPad
    // --------------------------------------------------------

    if (
        workspace &&
        event.pointerType === "touch"
    )
    {
        try
        {
            workspace.setPointerCapture(
                event.pointerId
            );
        }
        catch (e)
        {
            // Rien à faire.
        }
    }


    // --------------------------------------------------------
    // Enregistrer le pointeur
    // --------------------------------------------------------

    activePointers.set(
        event.pointerId,
        {
            x: event.clientX,
            y: event.clientY,
            type: event.pointerType
        }
    );


    // --------------------------------------------------------
    // Premier pointeur
    // --------------------------------------------------------

    if (
        activePointers.size === 1
    )
    {
        const point =
            canvasPointFromClient(
                event.clientX,
                event.clientY
            );


        singlePointer =
            event.pointerId;


        singlePointerMoved =
            false;


        lastPointerWorldX =
            point.x;


        lastPointerWorldY =
            point.y;


        // ----------------------------------------------------
        // Un clic sélectionne immédiatement la case.
        //
        // Cela permet également de commencer un click-drag.
        // ----------------------------------------------------

        toggleTileAt(
            lastPointerWorldX,
            lastPointerWorldY
        );


        return;
    }


    // --------------------------------------------------------
    // Deuxième pointeur
    //
    // Passage en mode pinch.
    // --------------------------------------------------------

    if (
        activePointers.size === 2
    )
    {
        singlePointerMoved =
            true;


        setupPointerPinch();
    }
}


function handlePointerMove(
    event
)
{
    if (
        !activePointers.has(
            event.pointerId
        )
    )
    {
        return;
    }


    event.preventDefault();


    activePointers.set(
        event.pointerId,
        {
            x: event.clientX,
            y: event.clientY,
            type: event.pointerType
        }
    );


    // --------------------------------------------------------
    // Deux pointeurs = pan + zoom
    // --------------------------------------------------------

    if (
        activePointers.size === 2
    )
    {
        handlePointerPinchMove();

        return;
    }


    if (
        activePointers.size !== 1
    )
    {
        return;
    }


    // --------------------------------------------------------
    // Un pointeur = sélection par glissement
    // --------------------------------------------------------

    const point =
        canvasPointFromClient(
            event.clientX,
            event.clientY
        );


    const worldX =
        point.x;


    const worldY =
        point.y;


    const previousCol =
        Math.floor(
            lastPointerWorldX /
            tileSize
        );


    const previousRow =
        Math.floor(
            lastPointerWorldY /
            tileSize
        );


    const col =
        Math.floor(
            worldX /
            tileSize
        );


    const row =
        Math.floor(
            worldY /
            tileSize
        );


    // --------------------------------------------------------
    // Une nouvelle case est traversée.
    // --------------------------------------------------------

    if (
        col !== previousCol ||
        row !== previousRow
    )
    {
        const index =
            tileIndexForPoint(
                worldX,
                worldY
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


    if (
        Math.abs(
            worldX -
            lastPointerWorldX
        ) > 0.5 ||
        Math.abs(
            worldY -
            lastPointerWorldY
        ) > 0.5
    )
    {
        singlePointerMoved =
            true;
    }


    lastPointerWorldX =
        worldX;


    lastPointerWorldY =
        worldY;
}
// ============================================================
// FIN POINTER
// ============================================================

function handlePointerUp(
    event
)
{
    event.preventDefault();


    const workspace =
        document.getElementById(
            "workspace"
        );


    if (
        workspace &&
        event.pointerType === "touch"
    )
    {
        try
        {
            workspace.releasePointerCapture(
                event.pointerId
            );
        }
        catch (e)
        {
            // Rien à faire.
        }
    }


    activePointers.delete(
        event.pointerId
    );


    // --------------------------------------------------------
    // Plus aucun pointeur
    // --------------------------------------------------------

    if (
        activePointers.size === 0
    )
    {
        singlePointer =
            null;


        singlePointerMoved =
            false;


        lastTouchDistance =
            0;


        return;
    }


    // --------------------------------------------------------
    // Il reste un seul pointeur.
    //
    // On reprend éventuellement la sélection avec celui-ci.
    // --------------------------------------------------------

    if (
        activePointers.size === 1
    )
    {
        const entry =
            activePointers.entries().next().value;


        if (entry)
        {
            const pointerId =
                entry[0];


            const pointer =
                entry[1];


            singlePointer =
                pointerId;


            const point =
                canvasPointFromClient(
                    pointer.x,
                    pointer.y
                );


            lastPointerWorldX =
                point.x;


            lastPointerWorldY =
                point.y;
        }


        lastTouchDistance =
            0;
    }
}


// ============================================================
// INITIALISATION PINCH
// ============================================================

function setupPointerPinch()
{
    if (
        activePointers.size !== 2
    )
    {
        return;
    }


    const pointers =
        Array.from(
            activePointers.values()
        );


    const p1 =
        pointers[0];


    const p2 =
        pointers[1];


    const dx =
        p2.x -
        p1.x;


    const dy =
        p2.y -
        p1.y;


    lastTouchDistance =
        Math.hypot(
            dx,
            dy
        );


    if (
        lastTouchDistance <= 0
    )
    {
        lastTouchDistance =
            1;
    }
}


// ============================================================
// PINCH : PAN + ZOOM
// ============================================================

function handlePointerPinchMove()
{
    if (
        activePointers.size !== 2
    )
    {
        return;
    }


    const entries =
        Array.from(
            activePointers.entries()
        );


    const p1 =
        entries[0][1];


    const p2 =
        entries[1][1];


    // --------------------------------------------------------
    // Centre écran du pinch
    // --------------------------------------------------------

    const screenX =
        (
            p1.x +
            p2.x
        ) * 0.5;


    const screenY =
        (
            p1.y +
            p2.y
        ) * 0.5;


    // --------------------------------------------------------
    // Distance entre les deux doigts
    // --------------------------------------------------------

    const dx =
        p2.x -
        p1.x;


    const dy =
        p2.y -
        p1.y;


    const distance =
        Math.hypot(
            dx,
            dy
        );


    if (
        distance <= 0
    )
    {
        return;
    }


    if (
        lastTouchDistance <= 0
    )
    {
        lastTouchDistance =
            distance;

        return;
    }


    // --------------------------------------------------------
    // Point du contenu situé sous le centre du pinch
    //
    // On le conserve fixe pendant le zoom.
    // --------------------------------------------------------

    const worldX =
        (
            screenX -
            panX
        ) /
        zoomFactor;


    const worldY =
        (
            screenY -
            panY
        ) /
        zoomFactor;


    // --------------------------------------------------------
    // Facteur de zoom
    // --------------------------------------------------------

    const scale =
        distance /
        lastTouchDistance;


    let newZoom =
        zoomFactor *
        scale;


    newZoom =
        Math.max(
            0.25,
            Math.min(
                5.0,
                newZoom
            )
        );


    // --------------------------------------------------------
    // Correction du déplacement pour conserver le point
    // sous les doigts.
    // --------------------------------------------------------

    panX =
        screenX -
        worldX *
        newZoom;


    panY =
        screenY -
        worldY *
        newZoom;


    zoomFactor =
        newZoom;


    lastTouchDistance =
        distance;


    updateCanvasTransform();
}


// ============================================================
// TRANSFORMATION CANVAS
// ============================================================

function updateCanvasTransform()
{
    if (!canvas)
    {
        return;
    }


    canvas.style.transformOrigin =
        "0 0";


    canvas.style.transform =
        "translate(" +
        panX +
        "px, " +
        panY +
        "px) scale(" +
        zoomFactor +
        ")";
}


// ============================================================
// TRACKPAD MAC
//
// Deux doigts sur le trackpad :
//      deltaX / deltaY = déplacement
//
// Pinch trackpad :
//      ctrlKey = true
//      deltaY = zoom
// ============================================================

function handleTrackpadWheel(
    event
)
{
    event.preventDefault();


    const workspace =
        document.getElementById(
            "workspace"
        );


    if (!workspace)
    {
        return;
    }


    const rect =
        workspace.getBoundingClientRect();


    const screenX =
        event.clientX -
        rect.left;


    const screenY =
        event.clientY -
        rect.top;


    // --------------------------------------------------------
    // PINCH TRACKPAD = ZOOM
    // --------------------------------------------------------

    if (
        event.ctrlKey
    )
    {
        // ----------------------------------------------------
        // Point du contenu situé sous le curseur.
        // Il doit rester sous le curseur pendant le zoom.
        // ----------------------------------------------------

        const worldX =
            (
                screenX -
                panX
            ) /
            zoomFactor;


        const worldY =
            (
                screenY -
                panY
            ) /
            zoomFactor;


        // ----------------------------------------------------
        // Zoom exponentiel pour obtenir un mouvement fluide.
        // ----------------------------------------------------

        const factor =
            Math.exp(
                -event.deltaY *
                0.01
            );


        let newZoom =
            zoomFactor *
            factor;


        newZoom =
            Math.max(
                0.25,
                Math.min(
                    5.0,
                    newZoom
                )
            );


        // ----------------------------------------------------
        // Recentrage sur le point sous le curseur.
        // ----------------------------------------------------

        panX =
            screenX -
            worldX *
            newZoom;


        panY =
            screenY -
            worldY *
            newZoom;


        zoomFactor =
            newZoom;


        updateCanvasTransform();


        return;
    }


    // --------------------------------------------------------
    // DEUX DOIGTS TRACKPAD = PAN
    // --------------------------------------------------------

    panX -=
        event.deltaX;


    panY -=
        event.deltaY;


    updateCanvasTransform();
}


// ============================================================
// ANCIENNES FONCTIONS TOUCH
//
// Elles sont conservées uniquement pour compatibilité avec
// d'éventuels appels provenant de l'ancien code.
//
// Aucun listener TouchEvent n'est enregistré.
//
// Le fonctionnement iPad passe exclusivement par Pointer Events.
// ============================================================

function handleTouchStart(
    event
)
{
    // Ancienne API conservée volontairement.
}


function handleTouchMove(
    event
)
{
    // Ancienne API conservée volontairement.
}


function handleTouchEnd(
    event
)
{
    // Ancienne API conservée volontairement.
}


// ============================================================
// EFFACER
// ============================================================

function clearAll()
{
    sourceImage =
        null;


    colorImage =
        null;


    paletteImage =
        null;


    selectedTiles =
        new Set();


    cols =
        0;


    rows =
        0;


    zoomFactor =
        1.0;


    panX =
        0;


    panY =
        0;


    activePointers.clear();


    singlePointer =
        null;


    singlePointerMoved =
        false;


    lastTouchDistance =
        0;


    if (canvas)
    {
        canvas.width =
            1;


        canvas.height =
            1;


        canvas.style.transformOrigin =
            "0 0";


        canvas.style.transform =
            "translate(0px, 0px) scale(1)";
    }


    if (ctx)
    {
        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );
    }


    const info =
        document.getElementById(
            "info"
        );


    if (info)
    {
        info.textContent =
            "Aucune image";
    }
}


// ============================================================
// CHANGEMENT TAILLE DES CASES
// ============================================================

function changeTileSize()
{
    const input =
        document.getElementById(
            "tileSize"
        );


    if (!input)
    {
        return;
    }


    let value =
        Number(
            input.value
        );


    if (
        !Number.isFinite(value)
    )
    {
        return;
    }


    value =
        Math.round(
            value
        );


    value =
        Math.max(
            2,
            Math.min(
                100,
                value
            )
        );


    input.value =
        value;


    tileSize =
        value;


    recomputeGrid();

    draw();


    const info =
        document.getElementById(
            "info"
        );


    if (
        info &&
        sourceImage
    )
    {
        info.textContent =
            sourceImage.width +
            " × " +
            sourceImage.height +
            " — " +
            cols +
            " × " +
            rows;
    }
}


// ============================================================
// INITIALISATION
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    function ()
    {
        // ----------------------------------------------------
        // Canvas
        // ----------------------------------------------------

        canvas =
            document.getElementById(
                "canvas"
            );


        if (!canvas)
        {
            console.error(
                "Canvas introuvable."
            );

            return;
        }


        ctx =
            canvas.getContext(
                "2d"
            );


        if (!ctx)
        {
            console.error(
                "Contexte 2D indisponible."
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


        const imageInput =
            document.getElementById(
                "imageInput"
            );


        const openGrilleButton =
            document.getElementById(
                "openGrilleButton"
            );


        const grilleInput =
            document.getElementById(
                "grilleInput"
            );


        const clearButton =
            document.getElementById(
                "clearButton"
            );


        const tileSizeInput =
            document.getElementById(
                "tileSize"
            );


        // ----------------------------------------------------
        // Ouvrir image
        // ----------------------------------------------------

        if (
            openButton &&
            imageInput
        )
        {
            openButton.addEventListener(
                "click",
                function ()
                {
                    imageInput.click();
                }
            );


            imageInput.addEventListener(
                "change",
                async function ()
                {
                    const file =
                        imageInput.files &&
                        imageInput.files[0];


                    if (!file)
                    {
                        return;
                    }


                    try
                    {
                        await loadImageFile(
                            file
                        );
                    }
                    catch (error)
                    {
                        console.error(
                            error
                        );


                        alert(
                            "Erreur lors du chargement de l'image."
                        );
                    }


                    imageInput.value =
                        "";
                }
            );
        }


        // ----------------------------------------------------
        // Ouvrir grille
        // ----------------------------------------------------

        if (
            openGrilleButton &&
            grilleInput
        )
        {
            openGrilleButton.addEventListener(
                "click",
                function ()
                {
                    grilleInput.click();
                }
            );


            grilleInput.addEventListener(
                "change",
                async function ()
                {
                    const file =
                        grilleInput.files &&
                        grilleInput.files[0];


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
                            "Erreur ouverture grille :",
                            error
                        );


                        alert(
                            "Erreur lors de l'ouverture de la grille :\n\n" +
                            error.message
                        );
                    }


                    grilleInput.value =
                        "";
                }
            );
        }


        // ----------------------------------------------------
        // Effacer
        // ----------------------------------------------------

        if (clearButton)
        {
            clearButton.addEventListener(
                "click",
                function ()
                {
                    clearAll();
                }
            );
        }


        // ----------------------------------------------------
        // Taille des cases
        // ----------------------------------------------------

        if (tileSizeInput)
        {
            tileSizeInput.addEventListener(
                "change",
                function ()
                {
                    changeTileSize();
                }
            );


            tileSizeInput.addEventListener(
                "input",
                function ()
                {
                    const value =
                        Number(
                            tileSizeInput.value
                        );


                    if (
                        Number.isFinite(value) &&
                        value >= 2 &&
                        value <= 100
                    )
                    {
                        tileSize =
                            Math.round(
                                value
                            );


                        recomputeGrid();

                        draw();
                    }
                }
            );
        }


        // ----------------------------------------------------
        // Workspace
        //
        // Tous les Pointer Events sont installés sur le
        // workspace, pas sur le canvas.
        //
        // C'est important car le canvas reçoit une
        // transformation CSS pendant le zoom/pan.
        // ----------------------------------------------------

        const workspace =
            document.getElementById(
                "workspace"
            );


        if (workspace)
        {
            workspace.addEventListener(
                "pointerdown",
                handlePointerDown,
                {
                    passive: false
                }
            );


            workspace.addEventListener(
                "pointermove",
                handlePointerMove,
                {
                    passive: false
                }
            );


            workspace.addEventListener(
                "pointerup",
                handlePointerUp,
                {
                    passive: false
                }
            );


            workspace.addEventListener(
                "pointercancel",
                handlePointerUp,
                {
                    passive: false
                }
            );


            // ------------------------------------------------
            // Trackpad Mac
            // ------------------------------------------------

            workspace.addEventListener(
                "wheel",
                handleTrackpadWheel,
                {
                    passive: false
                }
            );
        }


        // ----------------------------------------------------
        // Etat initial
        // ----------------------------------------------------

        recomputeGrid();

        draw();


        console.log(
            "Pixeliser initialisé."
        );
    }
);
