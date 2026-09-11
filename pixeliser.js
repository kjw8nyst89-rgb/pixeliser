import createLZFSEModule from "./lzfse/lzfse.js";


// ============================================================
// VARIABLES GLOBALES
// ============================================================

let lzfseModule = null;

let sourceImage = null;

let canvas = null;
let ctx = null;

let cols = 0;
let rows = 0;

let tileSize = 20;

let selectedTiles = new Set();

let zoomFactor = 1.0;

let lastTouchDistance = null;

let touchStartX = 0;
let touchStartY = 0;

let isDragging = false;


// ============================================================
// INITIALISATION LZFSE
// ============================================================

async function initializeLZFSE()
{
    console.log("Chargement du module LZFSE...");

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

        lzfseModule = module;

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


// ============================================================
// DISTANCE ENTRE DEUX TOUCHES
// ============================================================

function touchDistance(touch1, touch2)
{
    const dx =
        touch2.clientX -
        touch1.clientX;

    const dy =
        touch2.clientY -
        touch1.clientY;

    return Math.sqrt(
        dx * dx +
        dy * dy
    );
}


// ============================================================
// POSITION DANS LE CANVAS
// ============================================================

function canvasPointFromEvent(event)
{
    const rect =
        canvas.getBoundingClientRect();

    return {
        x:
            (event.clientX - rect.left) /
            zoomFactor,

        y:
            (event.clientY - rect.top) /
            zoomFactor
    };
}


// ============================================================
// CALCUL DE LA GRILLE
// ============================================================

function recomputeGrid()
{
    if (!sourceImage)
        return;

    cols =
        Math.ceil(
            sourceImage.naturalWidth /
            tileSize
        );

    rows =
        Math.ceil(
            sourceImage.naturalHeight /
            tileSize
        );

    canvas.width =
        cols * tileSize;

    canvas.height =
        rows * tileSize;

    updateCanvasSize();

    draw();

    updateInfo();
}


// ============================================================
// TAILLE AFFICHÉE DU CANVAS
// ============================================================

function updateCanvasSize()
{
    if (!canvas)
        return;

    canvas.style.width =
        (canvas.width * zoomFactor) +
        "px";

    canvas.style.height =
        (canvas.height * zoomFactor) +
        "px";
}


// ============================================================
// AFFICHAGE
// ============================================================

function draw()
{
    if (!canvas || !ctx)
        return;

    ctx.setTransform(
        1,
        0,
        0,
        1,
        0,
        0
    );

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


    // --------------------------------------------------------
    // Image
    // --------------------------------------------------------

    if (sourceImage)
    {
        ctx.drawImage(
            sourceImage,
            0,
            0,
            canvas.width,
            canvas.height
        );
    }


    // --------------------------------------------------------
    // Cases sélectionnées
    // --------------------------------------------------------

    ctx.save();

    ctx.globalAlpha = 0.35;

    ctx.fillStyle =
        "rgba(255, 0, 0, 0.5)";

    for (const index of selectedTiles)
    {
        const col =
            index % cols;

        const row =
            Math.floor(
                index / cols
            );

        ctx.fillRect(
            col * tileSize,
            row * tileSize,
            tileSize,
            tileSize
        );
    }

    ctx.restore();


    // --------------------------------------------------------
    // Grille
    // --------------------------------------------------------

    if (sourceImage)
    {
        ctx.save();

        ctx.strokeStyle =
            "rgba(0, 0, 0, 0.25)";

        ctx.lineWidth = 1;


        for (let x = 0; x <= cols; x++)
        {
            ctx.beginPath();

            ctx.moveTo(
                x * tileSize + 0.5,
                0
            );

            ctx.lineTo(
                x * tileSize + 0.5,
                rows * tileSize
            );

            ctx.stroke();
        }


        for (let y = 0; y <= rows; y++)
        {
            ctx.beginPath();

            ctx.moveTo(
                0,
                y * tileSize + 0.5
            );

            ctx.lineTo(
                cols * tileSize,
                y * tileSize + 0.5
            );

            ctx.stroke();
        }

        ctx.restore();
    }
}


// ============================================================
// INFORMATIONS
// ============================================================

function updateInfo()
{
    const info =
        document.getElementById(
            "info"
        );

    if (!info)
        return;

    if (!sourceImage)
    {
        info.textContent =
            "Aucune image";

        return;
    }

    info.textContent =
        `${sourceImage.naturalWidth} × ` +
        `${sourceImage.naturalHeight} — ` +
        `${cols} × ${rows} cases — ` +
        `${selectedTiles.size} sélectionnées`;
}


// ============================================================
// CHARGEMENT IMAGE
// ============================================================

function loadImageFile(file)
{
    if (!file)
        return;

    console.log(
        "Ouverture image :",
        file.name
    );

    const url =
        URL.createObjectURL(file);

    const image =
        new Image();

    image.onload = () =>
    {
        URL.revokeObjectURL(url);

        sourceImage = image;

        selectedTiles.clear();

        recomputeGrid();
    };

    image.onerror = () =>
    {
        URL.revokeObjectURL(url);

        console.error(
            "Impossible de charger l'image."
        );
    };

    image.src = url;
}


// ============================================================
// INDEX D'UNE CASE
// ============================================================

function tileIndexFromPoint(x, y)
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
        row < 0 ||
        col >= cols ||
        row >= rows
    )
    {
        return -1;
    }

    return row * cols + col;
}


// ============================================================
// SÉLECTION D'UNE CASE
// ============================================================

function toggleTileAtPoint(x, y)
{
    const index =
        tileIndexFromPoint(
            x,
            y
        );

    if (index < 0)
        return;

    if (selectedTiles.has(index))
    {
        selectedTiles.delete(index);
    }
    else
    {
        selectedTiles.add(index);
    }

    draw();

    updateInfo();
}


// ============================================================
// EFFACER
// ============================================================

function clearAll()
{
    selectedTiles.clear();

    draw();

    updateInfo();
}


// ============================================================
// ZOOM
// ============================================================

function setZoom(value)
{
    zoomFactor =
        Math.max(
            0.2,
            Math.min(
                5.0,
                value
            )
        );

    updateCanvasSize();
}


// ============================================================
// DÉCOMPRESSION LZFSE VIA MEMFS
// ============================================================

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


    // --------------------------------------------------------
    // Nettoyage fichiers précédents
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // JavaScript -> MEMFS
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // Appel C
    //
    // Le C connaît lui-même :
    //
    // /grille_input.lzfse
    // /grille_output.bin
    //
    // On ne passe donc aucun char* depuis JS.
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // MEMFS -> JavaScript
    // --------------------------------------------------------

    const decoded =
        lzfseModule.FS.readFile(
            outputPath
        );

    console.log(
        "Archive décompressée :",
        decoded.length,
        "octets"
    );


    if (
        decoded.length !==
        decodedSize
    )
    {
        console.warn(
            "Taille MEMFS différente :",
            decoded.length,
            decodedSize
        );
    }


    // --------------------------------------------------------
    // Nettoyage
    // --------------------------------------------------------

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
// BINARY PLIST / NSKeyedArchiver
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

    readUIntBE(offset, size)
    {
        let value = 0;

        for (let i = 0; i < size; i++)
        {
            value =
                value * 256 +
                this.bytes[offset + i];
        }

        return value;
    }

    readUIntLE(offset, size)
    {
        let value = 0;

        for (let i = size - 1; i >= 0; i--)
        {
            value =
                value * 256 +
                this.bytes[offset + i];
        }

        return value;
    }

    readDoubleBE(offset)
    {
        const buffer =
            this.bytes.buffer.slice(
                this.bytes.byteOffset + offset,
                this.bytes.byteOffset + offset + 8
            );

        return new DataView(buffer).getFloat64(0, false);
    }

    decode()
    {
        if (this.bytes.length < 40)
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
            this.bytes[trailer + 6];

        this.objectRefSize =
            this.bytes[trailer + 7];

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
                offsetIntSize: this.offsetIntSize,
                objectRefSize: this.objectRefSize,
                numObjects: this.numObjects,
                topObject: this.topObject,
                offsetTableOffset: this.offsetTableOffset
            }
        );

        // ----------------------------------------------------
        // Table des offsets
        // ----------------------------------------------------

        this.offsets = new Array(
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
                    i * this.offsetIntSize,
                    this.offsetIntSize
                );
        }

        // ----------------------------------------------------
        // Décodage des objets
        // ----------------------------------------------------

        this.objects = new Array(
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
                        info,
                        offset
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
                    type.toString(16) +
                    " objet " +
                    ref +
                    " offset " +
                    offset
                );
        }

        this.objects[ref] = value;

        return value;
    }

    decodeLength(info, offset)
    {
        if (info < 0x0F)
        {
            return {
                length: info,
                offset: offset + 1
            };
        }

        const marker =
            this.bytes[offset + 1];

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
            offset: offset + 2 + byteCount
        };
    }

    decodeSimple(info, offset)
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

    decodeInteger(info, offset)
    {
        const byteCount =
            1 << info;

        const value =
            this.readUIntBE(
                offset + 1,
                byteCount
            );

        return value;
    }

    decodeReal(info, offset)
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

            return new DataView(buffer)
                .getFloat32(0, false);
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

    decodeDate(info, offset)
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

    decodeData(info, offset)
    {
        const result =
            this.decodeLength(
                info,
                offset
            );

        const start =
            result.offset;

        const end =
            start + result.length;

        return this.bytes.slice(
            start,
            end
        );
    }

    decodeASCII(info, offset)
    {
        const result =
            this.decodeLength(
                info,
                offset
            );

        const start =
            result.offset;

        const end =
            start + result.length;

        let text = "";

        for (
            let i = start;
            i < end;
            i++
        )
        {
            text += String.fromCharCode(
                this.bytes[i]
            );
        }

        return text;
    }

    decodeUTF16(info, offset)
    {
        const result =
            this.decodeLength(
                info,
                offset
            );

        const start =
            result.offset;

        const count =
            result.length;

        const end =
            start + count * 2;

        let text = "";

        for (
            let i = start;
            i < end;
            i += 2
        )
        {
            const code =
                (this.bytes[i] << 8) |
                this.bytes[i + 1];

            text += String.fromCharCode(
                code
            );
        }

        return text;
    }

    decodeUID(info, offset)
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
                this.bytes[offset + 1 + i];
        }

        return {
            uid: value
        };
    }

    decodeArray(info, offset)
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

        const array =
            new Array(count);

        for (
            let i = 0;
            i < count;
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
                this.decodeObject(ref);
        }

        return array;
    }

    decodeDictionary(info, offset)
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
// OUTILS NSKEYEDARCHIVER
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


function findArchiveRoot(plist)
{
    console.log(
        "Recherche de $top..."
    );

    if (
        !plist ||
        typeof plist !== "object"
    )
    {
        throw new Error(
            "Plist racine invalide."
        );
    }

    console.log(
        "Clés plist racine :",
        Object.keys(plist)
    );

    const top =
        plist["$top"];

    if (!top)
    {
        throw new Error(
            "$top absent du NSKeyedArchiver."
        );
    }

    console.log(
        "$top :",
        top
    );

    return top;
}


function inspectKeyedArchive(bytes)
{
    console.log(
        "================================"
    );

    console.log(
        "DECODAGE BINARY PLIST"
    );

    console.log(
        "Taille :",
        bytes.length
    );

    const decoder =
        new BinaryPlistDecoder(bytes);

    const plist =
        decoder.decode();

    console.log(
        "Plist décodé :",
        plist
    );

    console.log(
        "Clés racine :",
        Object.keys(plist)
    );

    const top =
        findArchiveRoot(plist);

    console.log(
        "$top décodé :",
        top
    );

    console.log(
        "================================"
    );

    return {
        plist: plist,
        top: top,
        decoder: decoder
    };
}

// ============================================================
// NSKeyedArchiver RESOLVER
// ============================================================

class KeyedArchiveResolver
{
    constructor(plist)
    {
        this.plist = plist;
        this.objects =
            plist["$objects"];

        if (!Array.isArray(this.objects))
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

        const index =
            uidObject.uid;

        return this.resolveIndex(index);
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

        if (this.cache.has(index))
        {
            return this.cache.get(index);
        }

        if (this.resolving.has(index))
        {
            console.warn(
                "Référence circulaire UID :",
                index
            );

            return {
                "$circularUID": index
            };
        }

        const object =
            this.objects[index];

        // ----------------------------------------------------
        // Objet nul NSKeyedArchiver
        // ----------------------------------------------------

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

        this.resolving.add(index);

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
            this.resolving.delete(index);
        }

        this.cache.set(
            index,
            result
        );

        return result;
    }


    resolveObject(object)
    {
        // ----------------------------------------------------
        // UID
        // ----------------------------------------------------

        if (isUID(object))
        {
            return this.resolveIndex(
                object.uid
            );
        }


        // ----------------------------------------------------
        // Tableau
        // ----------------------------------------------------

        if (Array.isArray(object))
        {
            return object.map(
                value =>
                    this.resolveObject(
                        value
                    )
            );
        }


        // ----------------------------------------------------
        // NSData / primitive / NSString
        // ----------------------------------------------------

        if (
            object === null ||
            typeof object !== "object"
        )
        {
            return object;
        }


        // ----------------------------------------------------
        // Dictionnaire
        // ----------------------------------------------------

        const result = {};

        for (
            const key of Object.keys(object)
        )
        {
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


    dumpObject(index, depth = 0)
    {
        const indent =
            " ".repeat(depth * 2);

        if (
            index < 0 ||
            index >= this.objects.length
        )
        {
            console.log(
                indent +
                "UID invalide " +
                index
            );

            return;
        }

        const object =
            this.objects[index];

        console.log(
            indent +
            "UID[" +
            index +
            "] :",
            object
        );

        if (
            object &&
            typeof object === "object" &&
            !Array.isArray(object)
        )
        {
            if (object["$class"])
            {
                console.log(
                    indent +
                    "  $class :",
                    object["$class"]
                );
            }

            for (
                const key of Object.keys(object)
            )
            {
                if (
                    key === "$class"
                )
                {
                    continue;
                }

                const value =
                    object[key];

                if (isUID(value))
                {
                    console.log(
                        indent +
                        "  " +
                        key +
                        " -> UID " +
                        value.uid
                    );
                }
            }
        }
    }
}

// ============================================================
// LECTURE FICHIER .GRILLE
// ============================================================

async function loadGrilleFile(file)
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


    // --------------------------------------------------------
    // Lecture complète du fichier
    // --------------------------------------------------------

    const buffer =
        await file.arrayBuffer();

    const bytes =
        new Uint8Array(buffer);


    console.log(
        "Buffer reçu :",
        bytes.length,
        "octets"
    );


    if (bytes.length < 8)
    {
        throw new Error(
            "Fichier .grille trop court."
        );
    }


    // --------------------------------------------------------
    // Taille originale
    //
    // Les 8 premiers octets sont un uint64
    // little endian.
    // --------------------------------------------------------

    const view =
        new DataView(buffer);


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
    // Données compressées
    // --------------------------------------------------------

    const compressed =
        bytes.subarray(8);


    console.log(
        "Taille LZFSE :",
        compressed.length
    );


    // --------------------------------------------------------
    // Signature LZFSE
    // --------------------------------------------------------

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
            signature
        );


        if (signature !== "bvx2")
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


    // --------------------------------------------------------
    // Conservation temporaire
    // --------------------------------------------------------

   window.lastDecodedGrille =
    decoded;

console.log(
    "window.lastDecodedGrille disponible :",
    decoded.length,
    "octets"
);


// ============================================================
// TEST BINARY PLIST
// ============================================================

try
{
    try
{
    const archive =
        inspectKeyedArchive(
            decoded
        );

    window.lastPlist =
        archive.plist;

    window.lastPlistDecoder =
        archive.decoder;


    // ========================================================
    // NSKeyedArchiver
    // ========================================================

    const resolver =
        new KeyedArchiveResolver(
            archive.plist
        );

    window.lastArchiveResolver =
        resolver;


    console.log(
        "================================"
    );

    console.log(
        "NSKEYEDARCHIVER"
    );

    console.log(
        "Nombre d'objets :",
        archive.plist["$objects"].length
    );


    // --------------------------------------------------------
    // Affichage de quelques objets
    // --------------------------------------------------------

    const objects =
        archive.plist["$objects"];

    for (
        let i = 0;
        i < Math.min(
            objects.length,
            20
        );
        i++
    )
    {
        resolver.dumpObject(
            i
        );
    }


    // --------------------------------------------------------
    // Résolution de la racine
    // --------------------------------------------------------

    const root =
        resolver.root();

    window.lastArchiveRoot =
        root;


    console.log(
        "================================"
    );

    console.log(
        "OBJET RACINE NSKEYEDARCHIVER :"
    );

    console.log(
        root
    );


    if (
        root &&
        typeof root === "object"
    )
    {
        console.log(
            "Clés racine de l'objet archivé :",
            Object.keys(root)
        );
    }


    console.log(
        "================================"
    );

    alert(
        "NSKeyedArchiver décodé.\n\n" +
        "Objets : " +
        objects.length
    );
}
catch (error)
{
    console.error(
        "ERREUR NSKEYEDARCHIVER :",
        error
    );

    alert(
        "Erreur NSKeyedArchiver :\n" +
        error.message
    );
}

    window.lastPlist =
        archive.plist;

    window.lastArchiveTop =
        archive.top;

    window.lastPlistDecoder =
        archive.decoder;

    console.log(
        "Binary plist correctement décodé."
    );

    console.log(
        "Objet $top :",
        archive.top
    );

    alert(
        "Binary plist décodé.\n\n" +
        "Clés : " +
        Object.keys(
            archive.plist
        ).join(", ")
    );
}
catch (error)
{
    console.error(
        "ERREUR DECODAGE BINARY PLIST :",
        error
    );

    alert(
        "Erreur décodage binary plist :\n" +
        error.message
    );
}


    // --------------------------------------------------------
    // Affichage des premiers octets
    // --------------------------------------------------------

    console.log(
        "Premiers octets de l'archive :",
        Array.from(
            decoded.subarray(
                0,
                Math.min(
                    32,
                    decoded.length
                )
            )
        )
    );


    // --------------------------------------------------------
    // Pour l'instant :
    // LZFSE est terminé.
    //
    // Étape suivante :
    // décodage de NSKeyedArchiver.
    // --------------------------------------------------------

    alert(
        "Décompression LZFSE réussie : " +
        decoded.length +
        " octets."
    );
}


// ============================================================
// DOM
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    async () =>
{
    // --------------------------------------------------------
    // Canvas
    // --------------------------------------------------------

    canvas =
        document.getElementById(
            "canvas"
        );


    if (!canvas)
    {
        console.error(
            "Canvas #canvas introuvable !"
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
            "Impossible de créer le contexte 2D."
        );

        return;
    }


    // --------------------------------------------------------
    // Éléments HTML
    // --------------------------------------------------------

    const imageInput =
        document.getElementById(
            "imageInput"
        );


    const grilleInput =
        document.getElementById(
            "grilleInput"
        );


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


    const tileSizeInput =
        document.getElementById(
            "tileSize"
        );


    // --------------------------------------------------------
    // OUVRIR IMAGE
    // --------------------------------------------------------

    if (openButton)
    {
        openButton.addEventListener(
            "click",
            () =>
            {
                imageInput.click();
            }
        );
    }


    if (imageInput)
    {
        imageInput.addEventListener(
            "change",
            event =>
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


    // --------------------------------------------------------
    // OUVRIR GRILLE
    // --------------------------------------------------------

    if (openGrilleButton)
    {
        openGrilleButton.addEventListener(
            "click",
            () =>
            {
                grilleInput.click();
            }
        );
    }


    if (grilleInput)
    {
        grilleInput.addEventListener(
            "change",
            async event =>
            {
                const file =
                    event.target.files[0];


                if (!file)
                    return;


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
                        "Erreur lecture grille :\n\n" +
                        error.message
                    );
                }
            }
        );
    }


    // --------------------------------------------------------
    // EFFACER
    // --------------------------------------------------------

    if (clearButton)
    {
        clearButton.addEventListener(
            "click",
            clearAll
        );
    }


    // --------------------------------------------------------
    // TAILLE DES CASES
    // --------------------------------------------------------

    if (tileSizeInput)
    {
        tileSizeInput.addEventListener(
            "change",
            () =>
            {
                let value =
                    parseInt(
                        tileSizeInput.value,
                        10
                    );


                if (
                    !Number.isFinite(
                        value
                    )
                )
                {
                    value = 20;
                }


                value =
                    Math.max(
                        2,
                        Math.min(
                            100,
                            value
                        )
                    );


                tileSize =
                    value;


                tileSizeInput.value =
                    value;


                if (sourceImage)
                {
                    recomputeGrid();
                }
            }
        );
    }


    // --------------------------------------------------------
    // TOUCH START
    // --------------------------------------------------------

    canvas.addEventListener(
        "touchstart",
        event =>
        {
            event.preventDefault();


            // Deux doigts = début du zoom

            if (
                event.touches.length === 2
            )
            {
                lastTouchDistance =
                    touchDistance(
                        event.touches[0],
                        event.touches[1]
                    );

                isDragging = false;

                return;
            }


            // Un doigt

            if (
                event.touches.length === 1
            )
            {
                const touch =
                    event.touches[0];


                touchStartX =
                    touch.clientX;


                touchStartY =
                    touch.clientY;


                isDragging = false;
            }
        },
        {
            passive: false
        }
    );


    // --------------------------------------------------------
    // TOUCH MOVE
    // --------------------------------------------------------

    canvas.addEventListener(
        "touchmove",
        event =>
        {
            event.preventDefault();


            // ------------------------------------------------
            // Deux doigts = zoom
            // ------------------------------------------------

            if (
                event.touches.length === 2
            )
            {
                const distance =
                    touchDistance(
                        event.touches[0],
                        event.touches[1]
                    );


                if (
                    lastTouchDistance !== null
                )
                {
                    const ratio =
                        distance /
                        lastTouchDistance;


                    setZoom(
                        zoomFactor *
                        ratio
                    );
                }


                lastTouchDistance =
                    distance;


                return;
            }


            // ------------------------------------------------
            // Un doigt
            // ------------------------------------------------

            if (
                event.touches.length === 1
            )
            {
                const touch =
                    event.touches[0];


                const dx =
                    touch.clientX -
                    touchStartX;


                const dy =
                    touch.clientY -
                    touchStartY;


                if (
                    Math.abs(dx) > 5 ||
                    Math.abs(dy) > 5
                )
                {
                    isDragging = true;
                }
            }
        },
        {
            passive: false
        }
    );


    // --------------------------------------------------------
    // TOUCH END
    // --------------------------------------------------------

    canvas.addEventListener(
        "touchend",
        event =>
        {
            event.preventDefault();


            if (
                event.touches.length < 2
            )
            {
                lastTouchDistance =
                    null;
            }


            if (
                event.changedTouches.length === 1 &&
                !isDragging
            )
            {
                const touch =
                    event.changedTouches[0];


                const point =
                    canvasPointFromEvent(
                        touch
                    );


                toggleTileAtPoint(
                    point.x,
                    point.y
                );
            }


            isDragging = false;
        },
        {
            passive: false
        }
    );


    // --------------------------------------------------------
    // INITIALISATION LZFSE
    // --------------------------------------------------------

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
});
