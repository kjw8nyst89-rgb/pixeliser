import createLZFSEModule from "./lzfse/lzfse.js";
const version = "V6";
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
async function initializeLZFSE() {
    console.log("Chargement du module LZFSE...");
    try {
        const module = await createLZFSEModule();
        console.log("Module LZFSE créé :", module);
        console.log("decode_lzfse_memfs :", typeof module._decode_lzfse_memfs);
        if (typeof module._decode_lzfse_memfs !== "function") {
            throw new Error("_decode_lzfse_memfs n'est pas disponible.");
        }
        if (!module.FS) {
            throw new Error("Le système de fichiers MEMFS n'est pas disponible.");
        }
        lzfseModule = module;
        console.log("LZFSE prêt");
    } catch (error) {
        console.error("ERREUR INITIALISATION LZFSE :", error);
        throw error;
    }
}
async function decompressLZFSE(compressed, originalSize) {
    if (!lzfseModule) {
        throw new Error("Le module LZFSE n'est pas prêt.");
    }
    console.log("Décompression LZFSE via MEMFS...");
    console.log("Compressed :", compressed.length);
    console.log("Expected :", originalSize);
    const inputPath = "/grille_input.lzfse";
    const outputPath = "/grille_output.bin";
    try {
        lzfseModule.FS.unlink(inputPath);
    } catch (e) {}
    try {
        lzfseModule.FS.unlink(outputPath);
    } catch (e) {}
    console.log("Copie des données LZFSE dans MEMFS...");
    lzfseModule.FS.writeFile(inputPath, compressed);
    console.log("Fichier MEMFS créé :", inputPath);
    console.log("Appel decode_lzfse_memfs...");
    const decodedSize = lzfseModule._decode_lzfse_memfs(originalSize);
    console.log("Taille décompressée :", decodedSize);
    if (decodedSize <= 0) {
        throw new Error("Échec de la décompression LZFSE.");
    }
    const decoded = lzfseModule.FS.readFile(outputPath);
    console.log("Archive décompressée :", decoded.length, "octets");
    try {
        lzfseModule.FS.unlink(inputPath);
    } catch (e) {}
    try {
        lzfseModule.FS.unlink(outputPath);
    } catch (e) {}
    return new Uint8Array(decoded);
}
class BinaryPlistDecoder {
    constructor(bytes) {
        this.bytes = bytes;
        this.objects = [];
        this.offsets = [];
        this.objectRefSize = 0;
        this.offsetIntSize = 0;
        this.numObjects = 0;
        this.topObject = 0;
        this.offsetTableOffset = 0;
    }
    readUIntBE(offset, size) {
        let value = 0;
        for (let i = 0; i < size; i++) {
            value = value * 256 + this.bytes[offset + i];
        }
        return value;
    }
    readDoubleBE(offset) {
        const buffer = this.bytes.buffer.slice(
            this.bytes.byteOffset + offset,
            this.bytes.byteOffset + offset + 8
        );
        return new DataView(buffer).getFloat64(0, false);
    }
    decode() {
        if (this.bytes.length < 40) {
            throw new Error("Binary plist trop court.");
        }
        const magic = String.fromCharCode(
            this.bytes[0],
            this.bytes[1],
            this.bytes[2],
            this.bytes[3],
            this.bytes[4],
            this.bytes[5],
            this.bytes[6],
            this.bytes[7]
        );
        if (magic !== "bplist00") {
            throw new Error("Signature bplist00 absente.");
        }
        const trailerOffset = this.bytes.length - 32;
        this.offsetIntSize = this.bytes[trailerOffset + 6];
        this.objectRefSize = this.bytes[trailerOffset + 7];
        this.numObjects = this.readUIntBE(trailerOffset + 8, 8);
        this.topObject = this.readUIntBE(trailerOffset + 16, 8);
        this.offsetTableOffset = this.readUIntBE(trailerOffset + 24, 8);
        console.log("offsetIntSize:", this.offsetIntSize);
        console.log("objectRefSize:", this.objectRefSize);
        console.log("numObjects:", this.numObjects);
        console.log("topObject:", this.topObject);
        console.log("offsetTableOffset:", this.offsetTableOffset);
        this.offsets = new Array(this.numObjects);
        for (let i = 0; i < this.numObjects; i++) {
            this.offsets[i] = this.readUIntBE(
                this.offsetTableOffset + i * this.offsetIntSize,
                this.offsetIntSize
            );
        }
        this.objects = new Array(this.numObjects);
        for (let i = 0; i < this.numObjects; i++) {
            this.objects[i] = this.decodeObjectAt(i);
        }
        return this.objects[this.topObject];
    }
    readCount(offset, info) {
        if (info < 0x0f) {
            return {
                count: info,
                offset: offset
            };
        }
        const marker = this.bytes[offset];
        const type = marker >> 4;
        const integerInfo = marker & 0x0f;
        if (type !== 0x1) {
            throw new Error("Objet count invalide.");
        }
        const size = 1 << integerInfo;
        const count = this.readUIntBE(offset + 1, size);
        return {
            count: count,
            offset: offset + 1 + size
        };
    }
    decodeObjectAt(index) {
        const offset = this.offsets[index];
        const marker = this.bytes[offset];
        const type = marker >> 4;
        const info = marker & 0x0f;
        switch (type) {
            case 0x0:
                if (info === 0x0) return null;
                if (info === 0x8) return false;
                if (info === 0x9) return true;
                if (info === 0xf) return null;
                return null;
            case 0x1: {
                const size = 1 << info;
                return this.readUIntBE(offset + 1, size);
            }
            case 0x2: {
                const size = 1 << info;
                if (size === 4) {
                    const buffer = this.bytes.buffer.slice(
                        this.bytes.byteOffset + offset + 1,
                        this.bytes.byteOffset + offset + 5
                    );
                    return new DataView(buffer).getFloat32(0, false);
                }
                if (size === 8) {
                    return this.readDoubleBE(offset + 1);
                }
                throw new Error("Taille float non supportée : " + size);
            }
            case 0x3:
                if (info === 0x3) {
                    return this.readDoubleBE(offset + 1);
                }
                throw new Error("Date plist non supportée.");
            case 0x4: {
                const result = this.readCount(offset + 1, info);
                const count = result.count;
                const start = result.offset;
                return this.bytes.slice(start, start + count);
            }
            case 0x5: {
                const result = this.readCount(offset + 1, info);
                const count = result.count;
                const start = result.offset;
                let value = "";
                for (let i = 0; i < count; i++) {
                    value += String.fromCharCode(this.bytes[start + i]);
                }
                return value;
            }
            case 0x6: {
                const result = this.readCount(offset + 1, info);
                const count = result.count;
                const start = result.offset;
                const byteLength = count * 2;
                const buffer = this.bytes.buffer.slice(
                    this.bytes.byteOffset + start,
                    this.bytes.byteOffset + start + byteLength
                );
                return new TextDecoder("utf-16be").decode(buffer);
            }
            case 0x8: {
                const count = info + 1;
                const value = this.readUIntBE(
                    offset + 1,
                    count
                );
                return {
                    __uid: true,
                    uid: value
                };
            }
            case 0xa: {
                const result = this.readCount(offset + 1, info);
                const count = result.count;
                const start = result.offset;
                const refs = [];
                for (let i = 0; i < count; i++) {
                    refs.push(
                        this.readUIntBE(
                            start + i * this.objectRefSize,
                            this.objectRefSize
                        )
                    );
                }
                return refs.map(ref => ({
                    __uid: true,
                    uid: ref
                }));
            }
            case 0xd: {
                const result = this.readCount(offset + 1, info);
                const count = result.count;
                const start = result.offset;
                const keyRefs = [];
                const valueRefs = [];
                for (let i = 0; i < count; i++) {
                    keyRefs.push(
                        this.readUIntBE(
                            start + i * this.objectRefSize,
                            this.objectRefSize
                        )
                    );
                }
                const valuesStart =
                    start + count * this.objectRefSize;
                for (let i = 0; i < count; i++) {
                    valueRefs.push(
                        this.readUIntBE(
                            valuesStart + i * this.objectRefSize,
                            this.objectRefSize
                        )
                    );
                }
                return {
                    "NS.keys": keyRefs.map(ref => ({
                        __uid: true,
                        uid: ref
                    })),
                    "NS.objects": valueRefs.map(ref => ({
                        __uid: true,
                        uid: ref
                    }))
                };
            }
            default:
                throw new Error(
                    "Type objet plist non supporté : 0x" +
                    type.toString(16)
                );
        }
    }
}
function isUID(object) {
    return object &&
        typeof object === "object" &&
        object.__uid === true &&
        Number.isInteger(object.uid);
}
class KeyedArchiveResolver {
    constructor(plist) {
        this.plist = plist;
        this.objects = plist["$objects"];
        this.cache = new Map();
        this.resolving = new Set();
    }
    resolveUID(uid) {
        return this.resolveIndex(uid.uid);
    }
    resolveIndex(index) {
        if (this.cache.has(index)) {
            return this.cache.get(index);
        }
        if (index < 0 || index >= this.objects.length) {
            throw new Error("UID hors limites : " + index);
        }
        const object = this.objects[index];
        if (object === "$null" || object === null) {
            this.cache.set(index, null);
            return null;
        }
        if (this.resolving.has(index)) {
            throw new Error("Référence circulaire UID " + index);
        }
        this.resolving.add(index);
        let result;
        try {
            result = this.resolveObject(object);
        } finally {
            this.resolving.delete(index);
        }
        this.cache.set(index, result);
        return result;
    }
    resolveObject(object) {
        if (isUID(object)) {
            return this.resolveIndex(object.uid);
        }
        if (Array.isArray(object)) {
            return object.map(value => this.resolveObject(value));
        }
        if (object === null || typeof object !== "object") {
            return object;
        }
        if (object["NS.data"] instanceof Uint8Array) {
            return object["NS.data"];
        }
        if (
            object["NSRangeCount"] !== undefined &&
            object["NSRangeData"] !== undefined
        ) {
            return {
                type: "NSIndexSet",
                count: object["NSRangeCount"],
                rangeData: this.resolveObject(
                    object["NSRangeData"]
                )
            };
        }
        if (
            Array.isArray(object["NS.keys"]) &&
            Array.isArray(object["NS.objects"])
        ) {
            const dictionary = {};
            const keys = object["NS.keys"];
            const values = object["NS.objects"];
            for (let i = 0; i < keys.length; i++) {
                const key = this.resolveObject(keys[i]);
                const value = this.resolveObject(values[i]);
                dictionary[key] = value;
            }
            return dictionary;
        }
        const result = {};
        for (const key of Object.keys(object)) {
            if (key === "$class") continue;
            result[key] = this.resolveObject(object[key]);
        }
        return result;
    }
    root() {
        const top = this.plist["$top"];
        if (!top) {
            throw new Error("$top absent.");
        }
        const rootUID = top["root"];
        if (!rootUID) {
            throw new Error("root absent dans $top.");
        }
        console.log("UID racine :", rootUID.uid);
        return this.resolveUID(rootUID);
    }
}
function decodeGrilleArchive(decoded)
{
    console.log("================================");
    console.log("DECODAGE BINARY PLIST");
    console.log("Taille :", decoded.length);
    const decoder = new BinaryPlistDecoder(decoded);
    const rootObject = decoder.decode();
    window.lastPlist = rootObject;
    window.lastPlistDecoder = decoder;
    console.log("Plist décodé :", rootObject);
    console.log("Clés plist racine :", Object.keys(rootObject));
    if (!rootObject || !Array.isArray(rootObject["NS.keys"]) || !Array.isArray(rootObject["NS.objects"]))
    {
        throw new Error("Racine NSDictionary NSKeyedArchiver invalide.");
    }
    console.log("Racine NSDictionary NSKeyedArchiver détectée.");
    const dictionary = {};
    const keys = rootObject["NS.keys"];
    const values = rootObject["NS.objects"];
    if (keys.length !== values.length)
    {
        throw new Error("NS.keys et NS.objects ont des tailles différentes.");
    }
    for (let i = 0; i < keys.length; i++)
    {
        dictionary[keys[i]] = values[i];
    }
    console.log("Dictionnaire archive :", dictionary);
    const resolver = new KeyedArchiveResolver(dictionary);
    window.lastArchiveResolver = resolver;
    const root = resolver.root();
    window.lastArchiveRoot = root;
    console.log("Racine archive résolue :", root);
    if (!root || typeof root !== "object")
    {
        throw new Error("Racine NSKeyedArchiver invalide.");
    }
    return root;
}
function extractGrilleData(root) {
    console.log("================================");
    console.log("EXTRACTION DONNÉES GRILLE");
    if (!root || typeof root !== "object") {
        throw new Error("Objet racine NSKeyedArchiver invalide.");
    }
    const result = root;
    const expectedKeys = [
        "GRILLE",
        "COULEUR",
        "PALETTE",
        "ENCOURS",
        "TILESIZE",
        "TILEORIGIN"
    ];
    for (const key of expectedKeys) {
        if (Object.prototype.hasOwnProperty.call(result, key)) {
            console.log(key + " :", result[key]);
        } else {
            console.warn("Clé absente :", key);
        }
    }
    console.log("================================");
    return result;
}
async function loadGrilleFile(file) {
    console.log("===============================");
    console.log("OUVERTURE GRILLE");
    console.log("Nom :", file.name);
    console.log("Taille fichier :", file.size);
    console.log("Type :", file.type);
    console.log("===============================");
    if (!lzfseModule) {
        throw new Error("Le module LZFSE n'est pas prêt.");
    }
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 8) {
        throw new Error("Fichier grille trop court.");
    }
    const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength
    );
    const originalSizeNumber = view.getBigUint64(0, true);
    const originalSize = Number(originalSizeNumber);
    if (!Number.isSafeInteger(originalSize) || originalSize <= 0) {
        throw new Error(
            "Taille originale invalide : " +
            originalSizeNumber.toString()
        );
    }
    console.log("Taille originale annoncée :", originalSize);
    const compressed = bytes.slice(8);
    console.log("Taille LZFSE :", compressed.length);
    const signature = String.fromCharCode(
        compressed[0] || 0,
        compressed[1] || 0,
        compressed[2] || 0,
        compressed[3] || 0
    );
    console.log("Signature LZFSE :", signature);
    if (signature !== "bvx2") {
        console.warn(
            "Signature LZFSE inattendue :",
            signature
        );
    }
    const decoded = await decompressLZFSE(
        compressed,
        originalSize
    );
    const root = decodeGrilleArchive(decoded);
    const data = extractGrilleData(root);
    if (!(data["GRILLE"] instanceof Uint8Array)) {
        throw new Error("GRILLE ne contient pas de NSData.");
    }
    if (!(data["COULEUR"] instanceof Uint8Array)) {
        throw new Error("COULEUR ne contient pas de NSData.");
    }
    if (!(data["PALETTE"] instanceof Uint8Array)) {
        throw new Error("PALETTE ne contient pas de NSData.");
    }
    const grilleImage = await imageFromPNGData(data["GRILLE"]);
    const couleurImage = await imageFromPNGData(data["COULEUR"]);
    const palette = await imageFromPNGData(data["PALETTE"]);
    sourceImage = grilleImage;
    colorImage = couleurImage;
    paletteImage = palette;
    if (typeof data["TILESIZE"] === "number") {
        tileSize = Math.max(
            2,
            Math.min(100, data["TILESIZE"] * 2)
        );
        if (tileSizeInput) {
            tileSizeInput.value = tileSize;
        }
    }
    selectedTiles.clear();
    if (data["ENCOURS"] &&
        data["ENCOURS"].type === "NSIndexSet") {
        const indexes = decodeNSIndexSet(
            data["ENCOURS"]
        );
        for (const index of indexes) {
            let finalIndex = index;
            if (data["TILEORIGIN"] !== 1) {
                const macRow = Math.floor(index / cols);
                const col = index % cols;
                const ipadRow = rows - 1 - macRow;
                finalIndex = ipadRow * cols + col;
            }
            selectedTiles.add(finalIndex);
        }
    }
    recomputeGrid();
    if (data["ENCOURS"] &&
        data["ENCOURS"].type === "NSIndexSet" &&
        data["TILEORIGIN"] !== 1) {
        selectedTiles.clear();
        const indexes = decodeNSIndexSet(
            data["ENCOURS"]
        );
        for (const index of indexes) {
            const macRow = Math.floor(index / cols);
            const col = index % cols;
            const ipadRow = rows - 1 - macRow;
            if (
                ipadRow >= 0 &&
                ipadRow < rows &&
                col >= 0 &&
                col < cols
            ) {
                selectedTiles.add(
                    ipadRow * cols + col
                );
            }
        }
    }
    resetCamera();
    draw();
    if (info) {
        info.textContent =
            `${cols} × ${rows} — ${selectedTiles.size} sélectionnées`;
    }
    console.log("Grille chargée :", cols, "x", rows);
}
function imageFromPNGData(data) {
    return new Promise(function (resolve, reject) {
        const blob = new Blob(
            [data],
            { type: "image/png" }
        );
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = function () {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = function () {
            URL.revokeObjectURL(url);
            reject(
                new Error("Impossible de décoder l'image PNG.")
            );
        };
        image.src = url;
    });
}
function decodeNSIndexSet(indexSet) {
    if (!indexSet ||
        indexSet.type !== "NSIndexSet") {
        return [];
    }
    const data = indexSet.rangeData;
    if (!(data instanceof Uint8Array)) {
        return [];
    }
    const result = [];
    if (indexSet.count <= 0) {
        return result;
    }
    /*
     * NSIndexSet archivé par NSKeyedArchiver :
     * NSRangeCount = nombre de ranges.
     * NSRangeData contient les paires location,length.
     *
     * Sur les fichiers concernés, chaque NSRange est stocké
     * avec deux UInt64 little-endian.
     */
    const rangeSize = 16;
    const rangeCount = indexSet.count;
    if (data.length < rangeCount * rangeSize) {
        console.warn(
            "NSRangeData plus court que prévu :",
            data.length,
            rangeCount
        );
    }
    for (let i = 0; i < rangeCount; i++) {
        const offset = i * rangeSize;
        if (offset + rangeSize > data.length) {
            break;
        }
        const view = new DataView(
            data.buffer,
            data.byteOffset + offset,
            rangeSize
        );
        const locationBig = view.getBigUint64(0, true);
        const lengthBig = view.getBigUint64(8, true);
        const location = Number(locationBig);
        const length = Number(lengthBig);
        if (
            !Number.isSafeInteger(location) ||
            !Number.isSafeInteger(length)
        ) {
            console.warn("NSRange trop grand.");
            continue;
        }
        for (
            let j = 0;
            j < length;
            j++
        ) {
            result.push(location + j);
        }
    }
    return result;
}
function loadImageFile(file) {
    console.log("Chargement image :", file.name);
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = function () {
        URL.revokeObjectURL(url);
        sourceImage = image;
        colorImage = null;
        paletteImage = null;
        selectedTiles.clear();
        if (info) {
            info.textContent =
                `${image.naturalWidth} × ${image.naturalHeight}`;
        }
        recomputeGrid();
        resetCamera();
        draw();
        console.log(
            "Image chargée :",
            image.naturalWidth,
            "x",
            image.naturalHeight
        );
    };
    image.onerror = function () {
        URL.revokeObjectURL(url);
        console.error(
            "Impossible de charger l'image."
        );
        alert("Impossible de charger cette image.");
    };
    image.src = url;
}
function recomputeGrid() {
    if (!sourceImage) {
        cols = 0;
        rows = 0;
        return;
    }
    cols = Math.ceil(
        sourceImage.naturalWidth / tileSize
    );
    rows = Math.ceil(
        sourceImage.naturalHeight / tileSize
    );
    resizeCanvasToGrid();
    resetCamera();
}
function resizeCanvasToGrid() {
    if (!canvas || cols <= 0 || rows <= 0) {
        return;
    }
    const dpr = window.devicePixelRatio || 1;
    const worldWidth = cols * tileSize;
    const worldHeight = rows * tileSize;
    canvas.width = Math.max(
        1,
        Math.round(worldWidth * dpr)
    );
    canvas.height = Math.max(
        1,
        Math.round(worldHeight * dpr)
    );
    canvas.style.width =
        `${worldWidth}px`;
    canvas.style.height =
        `${worldHeight}px`;
    applyCamera();
}
function getViewportSize() {
    if (!workspace) {
        return {
            width: window.innerWidth,
            height: window.innerHeight
        };
    }
    const rect =
        workspace.getBoundingClientRect();
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
    const viewport =
        getViewportSize();
    const worldWidth =
        cols * tileSize;
    const worldHeight =
        rows * tileSize;
    if (
        worldWidth <= 0 ||
        worldHeight <= 0 ||
        viewport.width <= 0 ||
        viewport.height <= 0
    ) {
        zoomFactor = 1;
        panX = 0;
        panY = 0;
        applyCamera();
        return;
    }
    const margin = 20;
    const availableWidth =
        Math.max(
            1,
            viewport.width - margin * 2
        );
    const availableHeight =
        Math.max(
            1,
            viewport.height - margin * 2
        );
    zoomFactor = Math.min(
        availableWidth / worldWidth,
        availableHeight / worldHeight
    );
    zoomFactor = Math.max(
        0.05,
        Math.min(10, zoomFactor)
    );
    panX =
        (viewport.width -
            worldWidth * zoomFactor) *
        0.5;
    panY =
        (viewport.height -
            worldHeight * zoomFactor) *
        0.5;
    applyCamera();
}
function applyCamera() {
    if (!canvas) {
        return;
    }
    canvas.style.transform =
        `translate(${panX}px, ${panY}px) scale(${zoomFactor})`;
}
function canvasPointFromClient(
    clientX,
    clientY
) {
    if (!workspace) {
        return {
            x: 0,
            y: 0
        };
    }
    const rect =
        workspace.getBoundingClientRect();
    const screenX =
        clientX - rect.left;
    const screenY =
        clientY - rect.top;
    return {
        x:
            (screenX - panX) /
            zoomFactor,
        y:
            (screenY - panY) /
            zoomFactor
    };
}
function worldPointToScreen(
    x,
    y
) {
    return {
        x:
            panX +
            x * zoomFactor,
        y:
            panY +
            y * zoomFactor
    };
}
function clampZoom(value) {
    return Math.max(
        0.05,
        Math.min(10.0, value)
    );
}
function handleWorkspaceResize() {
    if (!canvas || cols <= 0 || rows <= 0) {
        return;
    }
    const viewport =
        getViewportSize();
    const centerScreenX =
        viewport.width * 0.5;
    const centerScreenY =
        viewport.height * 0.5;
    const centerWorldX =
        (centerScreenX - panX) /
        zoomFactor;
    const centerWorldY =
        (centerScreenY - panY) /
        zoomFactor;
    panX =
        centerScreenX -
        centerWorldX * zoomFactor;
    panY =
        centerScreenY -
        centerWorldY * zoomFactor;
    applyCamera();
}
function tileIndexForPoint(
    x,
    y
) {
    const col =
        Math.floor(x / tileSize);
    const row =
        Math.floor(y / tileSize);
    if (
        col < 0 ||
        col >= cols ||
        row < 0 ||
        row >= rows
    ) {
        return -1;
    }
    return row * cols + col;
}
function toggleTileAt(
    x,
    y
) {
    const index =
        tileIndexForPoint(x, y);
    if (index < 0) {
        return;
    }
    if (selectedTiles.has(index)) {
        selectedTiles.delete(index);
    } else {
        selectedTiles.add(index);
    }
    draw();
}
function selectTileAt(
    x,
    y
) {
    const index =
        tileIndexForPoint(x, y);
    if (index < 0) {
        return;
    }
    if (!selectedTiles.has(index)) {
        selectedTiles.add(index);
        draw();
    }
}
function pointerScreenPoint(
    event
) {
    const rect =
        workspace.getBoundingClientRect();
    return {
        x:
            event.clientX -
            rect.left,
        y:
            event.clientY -
            rect.top
    };
}
function pointerWorldPoint(
    event
) {
    return canvasPointFromClient(
        event.clientX,
        event.clientY
    );
}
function distanceBetweenPointers(
    a,
    b
) {
    const dx =
        b.x - a.x;
    const dy =
        b.y - a.y;
    return Math.hypot(dx, dy);
}
function centerBetweenPointers(
    a,
    b
) {
    return {
        x:
            (a.x + b.x) *
            0.5,
        y:
            (a.y + b.y) *
            0.5
    };
}
function setupPinch() {
    const pointers =
        Array.from(
            activePointers.values()
        );
    if (pointers.length !== 2) {
        return;
    }
    lastPinchDistance =
        distanceBetweenPointers(
            pointers[0],
            pointers[1]
        );
    lastPinchCenter =
        centerBetweenPointers(
            pointers[0],
            pointers[1]
        );
    pinchActive = true;
}
function handlePointerDown(
    event
) {
    if (!sourceImage) {
        return;
    }
    event.preventDefault();
    try {
        workspace.setPointerCapture(
            event.pointerId
        );
    } catch (_) {}
    const screen =
        pointerScreenPoint(event);
    activePointers.set(
        event.pointerId,
        {
            id: event.pointerId,
            pointerType:
                event.pointerType,
            x: screen.x,
            y: screen.y
        }
    );
    if (activePointers.size === 1) {
        singlePointerId =
            event.pointerId;
        singlePointerMoved =
            false;
        singlePointerWorld =
            pointerWorldPoint(event);
        pinchActive = false;
        if (
            event.pointerType !==
            "touch"
        ) {
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
function handlePointerMove(
    event
) {
    const pointer =
        activePointers.get(
            event.pointerId
        );
    if (
        !pointer ||
        !sourceImage
    ) {
        return;
    }
    event.preventDefault();
    const screen =
        pointerScreenPoint(event);
    pointer.x = screen.x;
    pointer.y = screen.y;
    if (activePointers.size >= 2) {
        const pointers =
            Array.from(
                activePointers.values()
            );
        const a = pointers[0];
        const b = pointers[1];
        const distance =
            distanceBetweenPointers(
                a,
                b
            );
        const center =
            centerBetweenPointers(
                a,
                b
            );
        if (
            lastPinchDistance > 0 &&
            lastPinchCenter
        ) {
            const worldX =
                (lastPinchCenter.x -
                    panX) /
                zoomFactor;
            const worldY =
                (lastPinchCenter.y -
                    panY) /
                zoomFactor;
            let newZoom =
                zoomFactor *
                (distance /
                    lastPinchDistance);
            newZoom =
                clampZoom(
                    newZoom
                );
            panX =
                center.x -
                worldX * newZoom;
            panY =
                center.y -
                worldY * newZoom;
            zoomFactor =
                newZoom;
            applyCamera();
        }
        lastPinchDistance =
            distance;
        lastPinchCenter =
            center;
        pinchActive = true;
        return;
    }
    if (
        activePointers.size !== 1 ||
        event.pointerId !==
            singlePointerId
    ) {
        return;
    }
    const world =
        pointerWorldPoint(event);
    if (singlePointerWorld) {
        const dx =
            world.x -
            singlePointerWorld.x;
        const dy =
            world.y -
            singlePointerWorld.y;
        if (
            Math.abs(dx) > 0.5 ||
            Math.abs(dy) > 0.5
        ) {
            singlePointerMoved =
                true;
        }
    }
    singlePointerWorld =
        world;
    if (
        event.pointerType ===
            "touch" ||
        event.buttons !== 0
    ) {
        selectTileAt(
            world.x,
            world.y
        );
    }
}
function handlePointerUp(
    event
) {
    const pointer =
        activePointers.get(
            event.pointerId
        );
    if (!pointer) {
        return;
    }
    event.preventDefault();
    const wasTouch =
        pointer.pointerType ===
        "touch";
    if (
        wasTouch &&
        activePointers.size === 1 &&
        event.pointerId ===
            singlePointerId &&
        !singlePointerMoved &&
        !pinchActive
    ) {
        const world =
            pointerWorldPoint(event);
        toggleTileAt(
            world.x,
            world.y
        );
    }
    activePointers.delete(
        event.pointerId
    );
    if (activePointers.size < 2) {
        lastPinchDistance = 0;
        lastPinchCenter = null;
    }
    if (activePointers.size === 1) {
        const remaining =
            Array.from(
                activePointers.values()
            )[0];
        singlePointerId =
            remaining.id;
        singlePointerMoved =
            true;
        pinchActive = false;
        singlePointerWorld = {
            x:
                (remaining.x -
                    panX) /
                zoomFactor,
            y:
                (remaining.y -
                    panY) /
                zoomFactor
        };
    }
    if (activePointers.size === 0) {
        singlePointerId = null;
        singlePointerMoved =
            false;
        singlePointerWorld =
            null;
        pinchActive = false;
    }
    try {
        workspace.releasePointerCapture(
            event.pointerId
        );
    } catch (_) {}
}
function handlePointerCancel(
    event
) {
    event.preventDefault();
    activePointers.delete(
        event.pointerId
    );
    lastPinchDistance = 0;
    lastPinchCenter = null;
    pinchActive = false;
    if (activePointers.size === 0) {
        singlePointerId = null;
        singlePointerMoved =
            false;
        singlePointerWorld =
            null;
    } else if (
        activePointers.size === 1
    ) {
        const remaining =
            Array.from(
                activePointers.values()
            )[0];
        singlePointerId =
            remaining.id;
        singlePointerMoved =
            true;
        singlePointerWorld = {
            x:
                (remaining.x -
                    panX) /
                zoomFactor,
            y:
                (remaining.y -
                    panY) /
                zoomFactor
        };
    }
    try {
        workspace.releasePointerCapture(
            event.pointerId
        );
    } catch (_) {}
}
function handleTrackpadWheel(
    event
) {
    if (!sourceImage) {
        return;
    }
    event.preventDefault();
    const rect =
        workspace.getBoundingClientRect();
    const screenX =
        event.clientX -
        rect.left;
    const screenY =
        event.clientY -
        rect.top;
    if (event.ctrlKey) {
        const worldX =
            (screenX - panX) /
            zoomFactor;
        const worldY =
            (screenY - panY) /
            zoomFactor;
        const factor =
            Math.exp(
                -event.deltaY *
                0.01
            );
        const newZoom =
            clampZoom(
                zoomFactor *
                factor
            );
        panX =
            screenX -
            worldX * newZoom;
        panY =
            screenY -
            worldY * newZoom;
        zoomFactor =
            newZoom;
        applyCamera();
        return;
    }
    panX -= event.deltaX;
    panY -= event.deltaY;
    applyCamera();
}
function draw() {
    if (!canvas || !ctx) {
        return;
    }
    const worldWidth =
        cols * tileSize;
    const worldHeight =
        rows * tileSize;
    if (
        worldWidth <= 0 ||
        worldHeight <= 0
    ) {
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
        return;
    }
    const dpr =
        window.devicePixelRatio ||
        1;
    ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );
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
            for (
                const index of selectedTiles
            ) {
                if (
                    index < 0 ||
                    index >=
                        cols * rows
                ) {
                    continue;
                }
                const row =
                    Math.floor(
                        index / cols
                    );
                const col =
                    index % cols;
                const x =
                    col * tileSize;
                const y =
                    row * tileSize;
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
            ctx.fillStyle =
                "rgba(255, 0, 0, 0.35)";
            for (
                const index of selectedTiles
            ) {
                if (
                    index < 0 ||
                    index >=
                        cols * rows
                ) {
                    continue;
                }
                const row =
                    Math.floor(
                        index / cols
                    );
                const col =
                    index % cols;
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
    ctx.lineWidth =
        1 /
        Math.max(
            zoomFactor,
            0.0001
        );
    ctx.strokeStyle =
        "rgba(0, 0, 0, 0.35)";
    for (
        let col = 0;
        col <= cols;
        col++
    ) {
        const x =
            col * tileSize +
            0.5;
        ctx.moveTo(
            x,
            0
        );
        ctx.lineTo(
            x,
            worldHeight
        );
    }
    for (
        let row = 0;
        row <= rows;
        row++
    ) {
        const y =
            row * tileSize +
            0.5;
        ctx.moveTo(
            0,
            y
        );
        ctx.lineTo(
            worldWidth,
            y
        );
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.lineWidth =
        1 /
        Math.max(
            zoomFactor,
            0.0001
        );
    ctx.strokeStyle =
        "rgba(0, 0, 0, 0.8)";
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
    console.log(
        "Sélection effacée."
    );
}
