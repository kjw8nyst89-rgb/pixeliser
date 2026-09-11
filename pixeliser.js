"use strict";


/* ==================================================
   PIXELISER
   ================================================== */


/* --------------------------------------------------
   Import du module LZFSE
   -------------------------------------------------- */

import createLZFSEModule
    from "./lzfse/lzfse.js";


/* --------------------------------------------------
   Éléments HTML
   -------------------------------------------------- */

const canvas =
    document.getElementById("canvas");

const ctx =
    canvas.getContext("2d");

const workspace =
    document.getElementById("workspace");

const imageInput =
    document.getElementById("imageInput");

const openButton =
    document.getElementById("openButton");

const clearButton =
    document.getElementById("clearButton");

const tileSizeInput =
    document.getElementById("tileSize");

const info =
    document.getElementById("info");


const openGrilleButton =
    document.getElementById("openGrilleButton");

const grilleInput =
    document.getElementById("grilleInput");


/* --------------------------------------------------
   Module LZFSE
   -------------------------------------------------- */

let lzfseModule = null;

let lzfseReady = false;


/* --------------------------------------------------
   Initialisation LZFSE
   -------------------------------------------------- */

let lzfseModule = null;

async function initializeLZFSE() {
    console.log("Chargement du module LZFSE...");

    try {
        const module = await createLZFSEModule();

        console.log("Module LZFSE créé :", module);
        console.log("malloc :", module._malloc);
        console.log("free :", module._free);
        console.log("decode :", module._decode_lzfse);
        console.log("HEAPU8 :", module.HEAPU8);
        console.log("HEAP8 :", module.HEAP8);
        console.log("wasmMemory :", module.wasmMemory);

        lzfseModule = module;

        console.log("LZFSE prêt");
    }
    catch (error) {
        console.error("ERREUR INITIALISATION LZFSE :", error);
        throw error;
    }
}


/* --------------------------------------------------
   Image
   -------------------------------------------------- */

let sourceImage = null;

let imageWidth = 0;
let imageHeight = 0;


/* --------------------------------------------------
   Grille
   -------------------------------------------------- */

let tileSize = 20;

let cols = 0;
let rows = 0;

let checkedTiles =
    new Set();


/* --------------------------------------------------
   Affichage
   -------------------------------------------------- */

let zoom = 1.0;

let offsetX = 0;
let offsetY = 0;


/* --------------------------------------------------
   Interaction tactile
   -------------------------------------------------- */

let pointers =
    new Map();

let lastPointerX = 0;
let lastPointerY = 0;

let pinchStartDistance = 0;
let pinchStartZoom = 1;


/* ==================================================
   OUVERTURE IMAGE
   ================================================== */

openButton.addEventListener(
    "click",
    () => {

        imageInput.value = "";

        imageInput.click();

    }
);


imageInput.addEventListener(
    "change",
    event => {

        const file =
            event.target.files[0];


        if (!file)
            return;


        console.log(
            "Image :",
            file.name
        );


        const url =
            URL.createObjectURL(file);


        const img =
            new Image();


        img.onload = () => {

            sourceImage = img;


            imageWidth =
                img.naturalWidth;


            imageHeight =
                img.naturalHeight;


            URL.revokeObjectURL(
                url
            );


            checkedTiles.clear();


            recomputeGrid();

            resetView();

            updateInfo();

            draw();

        };


        img.onerror = () => {

            URL.revokeObjectURL(
                url
            );


            info.textContent =
                "Erreur image";

        };


        img.src = url;

    }
);


/* ==================================================
   OUVERTURE .GRILLE
   ================================================== */

openGrilleButton.addEventListener(
    "click",
    () => {

        grilleInput.value = "";

        grilleInput.click();

    }
);


grilleInput.addEventListener(
    "change",
    async event => {

        const file =
            event.target.files[0];


        if (!file)
            return;


        console.log(
            "================================"
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
            "================================"
        );


        info.textContent =
            "Lecture de la grille...";


        try {

            await loadGrilleFile(
                file
            );

        }
        catch (error) {

            console.error(
                "Erreur lecture grille :",
                error
            );


            info.textContent =
                "Erreur lecture grille";

        }

    }
);


/* ==================================================
   LECTURE DU FICHIER .GRILLE
   ================================================== */

async function loadGrilleFile(file) {

    console.log("===============================");
    console.log("OUVERTURE GRILLE");
    console.log("Nom :", file.name);
    console.log("Taille fichier :", file.size);
    console.log("Type :", file.type);
    console.log("===============================");


    if (!lzfseModule) {
        throw new Error("Module LZFSE non chargé");
    }


    // ---------------------------------------------------------
    // Lire le fichier .grille
    // ---------------------------------------------------------

    const buffer = await file.arrayBuffer();

    console.log(
        "Buffer reçu :",
        buffer.byteLength,
        "octets"
    );


    if (buffer.byteLength < 8) {
        throw new Error(
            "Fichier .grille trop petit"
        );
    }


    // ---------------------------------------------------------
    // Les 8 premiers octets :
    // taille originale du NSKeyedArchiver
    //
    // uint64 little endian
    // ---------------------------------------------------------

    const view = new DataView(buffer);

    const originalSizeBig =
        view.getBigUint64(0, true);

    const originalSize =
        Number(originalSizeBig);


    console.log(
        "Taille originale annoncée :",
        originalSize
    );


    if (!Number.isSafeInteger(originalSize) ||
        originalSize <= 0) {

        throw new Error(
            "Taille originale invalide : " +
            originalSize
        );
    }


    // ---------------------------------------------------------
    // Partie LZFSE
    // ---------------------------------------------------------

    const compressedOffset = 8;

    const compressedSize =
        buffer.byteLength - compressedOffset;


    console.log(
        "Taille LZFSE :",
        compressedSize
    );


    if (compressedSize < 4) {
        throw new Error(
            "Données LZFSE absentes"
        );
    }


    const compressed =
        new Uint8Array(
            buffer,
            compressedOffset,
            compressedSize
        );


    // ---------------------------------------------------------
    // Vérification de la signature
    // ---------------------------------------------------------

    const magic =
        String.fromCharCode(
            compressed[0],
            compressed[1],
            compressed[2],
            compressed[3]
        );


    console.log(
        "Signature LZFSE :",
        magic
    );


    if (magic !== "bvx2" &&
        magic !== "bvx1" &&
        magic !== "bvxn" &&
        magic !== "bvx-") {

        throw new Error(
            "Signature LZFSE inconnue : " +
            magic
        );
    }


    // ---------------------------------------------------------
    // Noms des fichiers dans MEMFS
    // ---------------------------------------------------------

    const inputPath =
        "/grille_input.lzfse";

    const outputPath =
        "/grille_output.bin";


    // ---------------------------------------------------------
    // Nettoyage éventuel
    // ---------------------------------------------------------

    try {
        lzfseModule.FS.unlink(inputPath);
    }
    catch (e) {
        // fichier inexistant : normal
    }

    try {
        lzfseModule.FS.unlink(outputPath);
    }
    catch (e) {
        // fichier inexistant : normal
    }


    // ---------------------------------------------------------
    // Copier le LZFSE dans le système de fichiers WASM
    // ---------------------------------------------------------

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


    // ---------------------------------------------------------
    // Décompression
    // ---------------------------------------------------------

    console.log(
        "Décompression LZFSE..."
    );


    const decodedSize =
        lzfseModule._decode_lzfse_file(
            inputPath,
            outputPath
        );


    console.log(
        "Taille décompressée :",
        decodedSize
    );


    if (!decodedSize || decodedSize <= 0) {

        throw new Error(
            "Échec de la décompression LZFSE"
        );
    }


    // ---------------------------------------------------------
    // Lire le fichier décompressé depuis MEMFS
    // ---------------------------------------------------------

    const decoded =
        lzfseModule.FS.readFile(
            outputPath
        );


    console.log(
        "Buffer décompressé récupéré :",
        decoded.length,
        "octets"
    );


    // ---------------------------------------------------------
    // Vérification avec la taille annoncée
    // ---------------------------------------------------------

    if (decoded.length !== originalSize) {

        console.warn(
            "ATTENTION : taille différente !",
            "annoncée =",
            originalSize,
            "obtenue =",
            decoded.length
        );

    } else {

        console.log(
            "Taille décompressée correcte."
        );
    }


    // ---------------------------------------------------------
    // Afficher les premiers octets
    // ---------------------------------------------------------

    let hex = "";

    const count =
        Math.min(32, decoded.length);

    for (let i = 0; i < count; i++) {

        hex +=
            decoded[i]
                .toString(16)
                .padStart(2, "0") +
            " ";
    }


    console.log(
        "Premiers octets décompressés :",
        hex
    );


    // ---------------------------------------------------------
    // Nettoyage MEMFS
    // ---------------------------------------------------------

    try {
        lzfseModule.FS.unlink(inputPath);
    }
    catch (e) {
    }

    try {
        lzfseModule.FS.unlink(outputPath);
    }
    catch (e) {
    }


    // ---------------------------------------------------------
    // decoded est le NSKeyedArchiver
    // ---------------------------------------------------------

    return decoded;
}


/* ==================================================
   UINT64 LITTLE ENDIAN
   ================================================== */

function readUInt64LE(
    view,
    offset
) {

    /*
     * DataView.getBigUint64 est disponible
     * dans Safari moderne.
     */

    if (
        typeof view.getBigUint64 ===
        "function"
    ) {

        const value =
            view.getBigUint64(
                offset,
                true
            );


        /*
         * Conversion en Number.
         *
         * Ici nos archives sont très
         * largement sous Number.MAX_SAFE_INTEGER.
         */

        return Number(
            value
        );

    }


    /*
     * Fallback ancien navigateur.
     */

    const low =
        view.getUint32(
            offset,
            true
        );


    const high =
        view.getUint32(
            offset + 4,
            true
        );


    return (
        low +
        high *
        0x100000000
    );

}


/* ==================================================
   INSPECTION DE L'ARCHIVE
   ================================================== */

function inspectArchive(
    data
) {

    console.log(
        "================================"
    );


    console.log(
        "ARCHIVE DÉCOMPRESSÉE"
    );


    console.log(
        "Taille :",
        data.length
    );


    /*
     * Les premiers octets sont affichés
     * pour identifier le format.
     */

    const count =
        Math.min(
            32,
            data.length
        );


    let hex = "";


    for (
        let i = 0;
        i < count;
        i++
    ) {

        hex +=
            data[i]
                .toString(16)
                .padStart(2, "0") +
            " ";

    }


    console.log(
        "Premiers octets :",
        hex
    );


    /*
     * ASCII.
     */

    let ascii = "";


    for (
        let i = 0;
        i < count;
        i++
    ) {

        const c =
            data[i];


        if (
            c >= 32 &&
            c <= 126
        ) {

            ascii +=
                String.fromCharCode(c);

        }
        else {

            ascii += ".";

        }

    }


    console.log(
        "ASCII :",
        ascii
    );


    console.log(
        "================================"
    );


    /*
     * Pour l'instant nous ne tentons
     * PAS encore de décoder NSKeyedArchiver.
     */

}


/* ==================================================
   TAILLE DES CASES
   ================================================== */

tileSizeInput.addEventListener(
    "change",
    () => {

        let value =
            parseInt(
                tileSizeInput.value,
                10
            );


        if (
            !Number.isFinite(value)
        ) {

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
            tileSize;


        checkedTiles.clear();


        recomputeGrid();

        updateInfo();

        draw();

    }
);


/* ==================================================
   GRILLE
   ================================================== */

function recomputeGrid() {

    if (!sourceImage)
        return;


    cols =
        Math.ceil(
            imageWidth /
            tileSize
        );


    rows =
        Math.ceil(
            imageHeight /
            tileSize
        );

}


/* ==================================================
   RESET VUE
   ================================================== */

function resetView() {

    zoom = 1;


    const w =
        imageWidth *
        zoom;


    const h =
        imageHeight *
        zoom;


    offsetX =
        (
            workspace.clientWidth -
            w
        ) / 2;


    offsetY =
        (
            workspace.clientHeight -
            h
        ) / 2;

}


/* ==================================================
   INFORMATION
   ================================================== */

function updateInfo() {

    if (!sourceImage) {

        info.textContent =
            "Aucune image";

        return;

    }


    info.textContent =
        `${imageWidth} × ${imageHeight} — ` +
        `${cols} × ${rows} cases — ` +
        `${checkedTiles.size} sélectionnées`;

}


/* ==================================================
   DESSIN
   ================================================== */

function draw() {

    const width =
        workspace.clientWidth;


    const height =
        workspace.clientHeight;


    canvas.width =
        Math.max(
            1,
            width
        );


    canvas.height =
        Math.max(
            1,
            height
        );


    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


    if (!sourceImage)
        return;


    ctx.save();


    ctx.translate(
        offsetX,
        offsetY
    );


    ctx.scale(
        zoom,
        zoom
    );


    ctx.drawImage(
        sourceImage,
        0,
        0
    );


    drawCheckedTiles();

    drawGrid();


    ctx.restore();

}


/* ==================================================
   CASES SÉLECTIONNÉES
   ================================================== */

function drawCheckedTiles() {

    ctx.fillStyle =
        "rgba(255, 60, 60, 0.35)";


    checkedTiles.forEach(
        index => {

            const row =
                Math.floor(
                    index /
                    cols
                );


            const col =
                index %
                cols;


            const x =
                col *
                tileSize;


            const y =
                row *
                tileSize;


            const w =
                Math.min(
                    tileSize,
                    imageWidth - x
                );


            const h =
                Math.min(
                    tileSize,
                    imageHeight - y
                );


            if (
                w <= 0 ||
                h <= 0
            )
                return;


            ctx.fillRect(
                x,
                y,
                w,
                h
            );

        }
    );

}


/* ==================================================
   GRILLE
   ================================================== */

function drawGrid() {

    if (
        cols <= 0 ||
        rows <= 0
    )
        return;


    ctx.beginPath();


    for (
        let col = 0;
        col <= cols;
        col++
    ) {

        const x =
            col *
            tileSize;


        ctx.moveTo(
            x,
            0
        );


        ctx.lineTo(
            x,
            rows *
            tileSize
        );

    }


    for (
        let row = 0;
        row <= rows;
        row++
    ) {

        const y =
            row *
            tileSize;


        ctx.moveTo(
            0,
            y
        );


        ctx.lineTo(
            cols *
            tileSize,
            y
        );

    }


    ctx.lineWidth =
        1 /
        zoom;


    ctx.strokeStyle =
        "rgba(0, 0, 0, 0.35)";


    ctx.stroke();

}


/* ==================================================
   ÉCRAN → IMAGE
   ================================================== */

function imagePointFromScreen(
    screenX,
    screenY
) {

    return {

        x:
            (
                screenX -
                offsetX
            ) /
            zoom,


        y:
            (
                screenY -
                offsetY
            ) /
            zoom

    };

}


/* ==================================================
   CASE SOUS LE DOIGT
   ================================================== */

function tileAtScreenPoint(
    screenX,
    screenY
) {

    if (!sourceImage)
        return -1;


    const point =
        imagePointFromScreen(
            screenX,
            screenY
        );


    const col =
        Math.floor(
            point.x /
            tileSize
        );


    const row =
        Math.floor(
            point.y /
            tileSize
        );


    if (
        col < 0 ||
        row < 0 ||
        col >= cols ||
        row >= rows
    ) {

        return -1;

    }


    return (
        row *
        cols +
        col
    );

}


/* ==================================================
   TOGGLE CASE
   ================================================== */

function toggleTile(
    screenX,
    screenY
) {

    const index =
        tileAtScreenPoint(
            screenX,
            screenY
        );


    if (index < 0)
        return;


    if (
        checkedTiles.has(
            index
        )
    ) {

        checkedTiles.delete(
            index
        );

    }
    else {

        checkedTiles.add(
            index
        );

    }


    updateInfo();

    draw();

}


/* ==================================================
   EFFACER
   ================================================== */

clearButton.addEventListener(
    "click",
    () => {

        checkedTiles.clear();

        updateInfo();

        draw();

    }
);


/* ==================================================
   POINTER DOWN
   ================================================== */

canvas.addEventListener(
    "pointerdown",
    event => {

        canvas.setPointerCapture(
            event.pointerId
        );


        pointers.set(
            event.pointerId,
            {
                x: event.clientX,
                y: event.clientY
            }
        );


        if (
            pointers.size === 1
        ) {

            toggleTile(
                event.clientX,
                event.clientY
            );


            lastPointerX =
                event.clientX;


            lastPointerY =
                event.clientY;

        }


        if (
            pointers.size === 2
        ) {

            pinchStartDistance =
                pointerDistance();


            pinchStartZoom =
                zoom;

        }

    }
);


/* ==================================================
   POINTER MOVE
   ================================================== */

canvas.addEventListener(
    "pointermove",
    event => {

        if (
            !pointers.has(
                event.pointerId
            )
        )
            return;


        pointers.set(
            event.pointerId,
            {
                x: event.clientX,
                y: event.clientY
            }
        );


        if (
            pointers.size === 2
        ) {

            const distance =
                pointerDistance();


            if (
                pinchStartDistance > 0
            ) {

                const factor =
                    distance /
                    pinchStartDistance;


                zoom =
                    pinchStartZoom *
                    factor;


                zoom =
                    Math.max(
                        0.1,
                        Math.min(
                            10,
                            zoom
                        )
                    );


                draw();

            }


            return;

        }

    }
);


/* ==================================================
   POINTER UP
   ================================================== */

canvas.addEventListener(
    "pointerup",
    event => {

        pointers.delete(
            event.pointerId
        );


        if (
            pointers.size < 2
        ) {

            pinchStartDistance = 0;

        }

    }
);


/* ==================================================
   POINTER CANCEL
   ================================================== */

canvas.addEventListener(
    "pointercancel",
    event => {

        pointers.delete(
            event.pointerId
        );


        if (
            pointers.size < 2
        ) {

            pinchStartDistance = 0;

        }

    }
);


/* ==================================================
   DISTANCE DOIGTS
   ================================================== */

function pointerDistance() {

    const values =
        Array.from(
            pointers.values()
        );


    if (
        values.length < 2
    )
        return 0;


    const dx =
        values[0].x -
        values[1].x;


    const dy =
        values[0].y -
        values[1].y;


    return Math.sqrt(
        dx * dx +
        dy * dy
    );

}


/* ==================================================
   RESIZE
   ================================================== */

window.addEventListener(
    "resize",
    () => {

        draw();

    }
);


/* ==================================================
   INITIALISATION
   ================================================== */

draw();

initializeLZFSE();
