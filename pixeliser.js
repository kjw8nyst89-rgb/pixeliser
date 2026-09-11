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

async function initializeLZFSE() {

    console.log("Chargement du module LZFSE...");

    try {

        const module =
            await createLZFSEModule();

        console.log(
            "Module LZFSE créé :",
            module
        );

        console.log(
            "decode_lzfse_file :",
            module._decode_lzfse_file
        );

        lzfseModule = module;

        lzfseModule.decodeLZFSEFile =
    lzfseModule.cwrap(
        "decode_lzfse_file",
        "number",
        ["string", "string", "number"]
    );

console.log(
    "decodeLZFSEFile :",
    lzfseModule.decodeLZFSEFile
);

        console.log("LZFSE prêt");

    }
    catch (error) {

        console.error(
            "ERREUR INITIALISATION LZFSE :",
            error
        );

        throw error;
    }
}


// ============================================================
// DOM
// ============================================================

document.addEventListener("DOMContentLoaded", () => {

    canvas =
        document.getElementById("canvas");

    ctx =
        canvas.getContext("2d");

    const imageInput =
        document.getElementById("imageInput");

    const grilleInput =
        document.getElementById("grilleInput");

    const openButton =
        document.getElementById("openButton");

    const openGrilleButton =
        document.getElementById("openGrilleButton");

    const clearButton =
        document.getElementById("clearButton");

    const tileSizeInput =
        document.getElementById("tileSize");


    // --------------------------------------------------------
    // Ouvrir image
    // --------------------------------------------------------

    if (openButton) {

        openButton.addEventListener(
            "click",
            () => imageInput.click()
        );
    }


    if (imageInput) {

        imageInput.addEventListener(
            "change",
            event => {

                const file =
                    event.target.files[0];

                if (!file) {
                    return;
                }

                loadImageFile(file);
            }
        );
    }


    // --------------------------------------------------------
    // Ouvrir grille
    // --------------------------------------------------------

    if (openGrilleButton) {

        openGrilleButton.addEventListener(
            "click",
            () => grilleInput.click()
        );
    }


    if (grilleInput) {

        grilleInput.addEventListener(
            "change",
            async event => {

                const file =
                    event.target.files[0];

                if (!file) {
                    return;
                }

                try {

                    const decoded =
                        await loadGrilleFile(file);

                    console.log(
                        "NSKeyedArchiver récupéré :",
                        decoded.length,
                        "octets"
                    );

                    /*
                     * Pour l'instant le buffer contient le
                     * NSKeyedArchiver.
                     *
                     * Le décodage de l'archive viendra ensuite.
                     */

                }
                catch (error) {

                    console.error(
                        "Erreur lecture grille :",
                        error
                    );

                    alert(
                        "Impossible de lire le fichier .grille.\n\n" +
                        error.message
                    );
                }

                // Permet de sélectionner à nouveau le même fichier.
                event.target.value = "";
            }
        );
    }


    // --------------------------------------------------------
    // Effacer
    // --------------------------------------------------------

    if (clearButton) {

        clearButton.addEventListener(
            "click",
            clearSelection
        );
    }


    // --------------------------------------------------------
    // Taille des cases
    // --------------------------------------------------------

    if (tileSizeInput) {

        tileSizeInput.addEventListener(
            "change",
            () => {

                let value =
                    parseInt(
                        tileSizeInput.value,
                        10
                    );

                if (!Number.isFinite(value)) {
                    value = 20;
                }

                value =
                    Math.max(
                        2,
                        Math.min(100, value)
                    );

                tileSize = value;

                tileSizeInput.value =
                    String(tileSize);

                recomputeGrid();
                drawGrid();
            }
        );
    }


    // --------------------------------------------------------
    // Souris
    // --------------------------------------------------------

    canvas.addEventListener(
        "click",
        event => {

            if (!sourceImage) {
                return;
            }

            const rect =
                canvas.getBoundingClientRect();

            const x =
                (event.clientX - rect.left) /
                zoomFactor;

            const y =
                (event.clientY - rect.top) /
                zoomFactor;

            selectTileAtPoint(x, y);
        }
    );


    // --------------------------------------------------------
    // Touch
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // Resize
    // --------------------------------------------------------

    window.addEventListener(
        "resize",
        () => {

            if (sourceImage) {
                drawGrid();
            }
        }
    );


    // --------------------------------------------------------
    // Initialisation
    // --------------------------------------------------------

    initializeLZFSE();

});


// ============================================================
// CHARGEMENT IMAGE
// ============================================================

function loadImageFile(file) {

    console.log(
        "Chargement image :",
        file.name
    );

    const reader =
        new FileReader();

    reader.onload = event => {

        const image =
            new Image();

        image.onload = () => {

            sourceImage = image;

            zoomFactor = 1.0;

            selectedTiles.clear();

            recomputeGrid();

            drawGrid();

            updateInfo();

            console.log(
                "Image chargée :",
                image.width,
                "x",
                image.height
            );
        };

        image.onerror = () => {

            console.error(
                "Impossible de décoder l'image"
            );

            alert(
                "Impossible de charger cette image."
            );
        };

        image.src =
            event.target.result;
    };

    reader.onerror = () => {

        alert(
            "Erreur lors de la lecture de l'image."
        );
    };

    reader.readAsDataURL(file);
}


// ============================================================
// GRILLE
// ============================================================

function recomputeGrid() {

    if (!sourceImage) {

        cols = 0;
        rows = 0;

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
}


// ============================================================
// DESSIN
// ============================================================

function drawGrid() {

    if (!ctx) {
        return;
    }


    ctx.save();

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


    // --------------------------------------------------------
    // Image
    // --------------------------------------------------------

    if (sourceImage) {

        ctx.drawImage(
            sourceImage,
            0,
            0,
            canvas.width,
            canvas.height
        );
    }


    // --------------------------------------------------------
    // Grille
    // --------------------------------------------------------

    if (sourceImage) {

        ctx.beginPath();

        for (let x = 0;
             x <= cols * tileSize;
             x += tileSize) {

            ctx.moveTo(x, 0);
            ctx.lineTo(
                x,
                rows * tileSize
            );
        }

        for (let y = 0;
             y <= rows * tileSize;
             y += tileSize) {

            ctx.moveTo(0, y);
            ctx.lineTo(
                cols * tileSize,
                y
            );
        }

        ctx.strokeStyle =
            "rgba(0,0,0,0.25)";

        ctx.lineWidth = 1;

        ctx.stroke();
    }


    // --------------------------------------------------------
    // Cases sélectionnées
    // --------------------------------------------------------

    ctx.fillStyle =
        "rgba(255,255,255,0.45)";

    selectedTiles.forEach(index => {

        const row =
            Math.floor(index / cols);

        const col =
            index % cols;

        ctx.fillRect(
            col * tileSize,
            row * tileSize,
            tileSize,
            tileSize
        );
    });


    ctx.restore();
}


// ============================================================
// SELECTION CASE
// ============================================================

function selectTileAtPoint(x, y) {

    if (!sourceImage ||
        cols <= 0 ||
        rows <= 0) {

        return;
    }


    const col =
        Math.floor(x / tileSize);

    const row =
        Math.floor(y / tileSize);


    if (col < 0 ||
        col >= cols ||
        row < 0 ||
        row >= rows) {

        return;
    }


    const index =
        row * cols + col;


    if (selectedTiles.has(index)) {

        selectedTiles.delete(index);

    } else {

        selectedTiles.add(index);
    }


    drawGrid();
    updateInfo();
}


// ============================================================
// EFFACER
// ============================================================

function clearSelection() {

    selectedTiles.clear();

    drawGrid();

    updateInfo();
}


// ============================================================
// INFORMATIONS
// ============================================================

function updateInfo() {

    const info =
        document.getElementById("info");

    if (!info) {
        return;
    }


    if (!sourceImage) {

        info.textContent =
            "Aucune image";

        return;
    }


    info.textContent =
        `${sourceImage.width} × ${sourceImage.height} — ` +
        `${cols} × ${rows} — ` +
        `${selectedTiles.size} sélectionnée(s)`;
}


// ============================================================
// TOUCH
// ============================================================

function handleTouchStart(event) {

    event.preventDefault();


    if (event.touches.length === 1) {

        const touch =
            event.touches[0];

        touchStartX =
            touch.clientX;

        touchStartY =
            touch.clientY;

        isDragging = false;

        return;
    }


    if (event.touches.length === 2) {

        lastTouchDistance =
            getTouchDistance(
                event.touches[0],
                event.touches[1]
            );
    }
}


function handleTouchMove(event) {

    event.preventDefault();


    // --------------------------------------------------------
    // Zoom à deux doigts
    // --------------------------------------------------------

    if (event.touches.length === 2) {

        const distance =
            getTouchDistance(
                event.touches[0],
                event.touches[1]
            );


        if (lastTouchDistance !== null) {

            const delta =
                distance -
                lastTouchDistance;


            zoomFactor *=
                1 + delta * 0.005;


            zoomFactor =
                Math.max(
                    0.2,
                    Math.min(
                        5.0,
                        zoomFactor
                    )
                );


            applyZoom();
        }


        lastTouchDistance =
            distance;

        return;
    }


    // --------------------------------------------------------
    // Déplacement / sélection
    // --------------------------------------------------------

    if (event.touches.length === 1) {

        const touch =
            event.touches[0];

        const dx =
            touch.clientX -
            touchStartX;

        const dy =
            touch.clientY -
            touchStartY;


        if (Math.abs(dx) > 8 ||
            Math.abs(dy) > 8) {

            isDragging = true;
        }
    }
}


function handleTouchEnd(event) {

    event.preventDefault();


    if (event.touches.length === 0) {

        lastTouchDistance = null;
    }


    /*
     * Une seule touche qui n'a pratiquement pas bougé =
     * sélection d'une case.
     */

    if (!isDragging &&
        event.changedTouches.length === 1) {

        const touch =
            event.changedTouches[0];

        const rect =
            canvas.getBoundingClientRect();


        const x =
            (touch.clientX - rect.left) /
            zoomFactor;

        const y =
            (touch.clientY - rect.top) /
            zoomFactor;


        selectTileAtPoint(x, y);
    }


    isDragging = false;
}


// ============================================================
// DISTANCE ENTRE DEUX DOIGTS
// ============================================================

function getTouchDistance(a, b) {

    const dx =
        a.clientX - b.clientX;

    const dy =
        a.clientY - b.clientY;

    return Math.sqrt(
        dx * dx +
        dy * dy
    );
}


// ============================================================
// ZOOM
// ============================================================

function applyZoom() {

    canvas.style.transform =
        `scale(${zoomFactor})`;

    canvas.style.transformOrigin =
        "top left";
}


// ============================================================
// LECTURE .GRILLE / LZFSE
// ============================================================

async function loadGrilleFile(file) {

    console.log("===============================");
    console.log("OUVERTURE GRILLE");
    console.log("Nom :", file.name);
    console.log("Taille fichier :", file.size);
    console.log("Type :", file.type);
    console.log("===============================");


    if (!lzfseModule) {

        throw new Error(
            "Module LZFSE non chargé"
        );
    }


    // --------------------------------------------------------
    // Vérifier que la bonne fonction est présente
    // --------------------------------------------------------

    console.log(
        "decode_lzfse_file :",
        lzfseModule._decode_lzfse_file
    );


    if (
        typeof lzfseModule._decode_lzfse_file !==
        "function"
    ) {

        throw new Error(
            "La fonction _decode_lzfse_file " +
            "n'est pas disponible dans lzfse.wasm"
        );
    }


    // --------------------------------------------------------
    // Lecture du fichier
    // --------------------------------------------------------

    const buffer =
        await file.arrayBuffer();


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


    // --------------------------------------------------------
    // Taille originale
    // --------------------------------------------------------

    const view =
        new DataView(buffer);


    const originalSizeBig =
        view.getBigUint64(
            0,
            true
        );


    const originalSize =
        Number(originalSizeBig);


    console.log(
        "Taille originale annoncée :",
        originalSize
    );


    if (
        !Number.isSafeInteger(originalSize) ||
        originalSize <= 0
    ) {

        throw new Error(
            "Taille originale invalide : " +
            originalSize
        );
    }


    // --------------------------------------------------------
    // Données compressées
    // --------------------------------------------------------

    const compressedOffset = 8;

    const compressedSize =
        buffer.byteLength -
        compressedOffset;


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


    // --------------------------------------------------------
    // Signature
    // --------------------------------------------------------

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


    if (
        magic !== "bvx2" &&
        magic !== "bvx1" &&
        magic !== "bvxn" &&
        magic !== "bvx-"
    ) {

        throw new Error(
            "Signature LZFSE inconnue : " +
            magic
        );
    }


    // --------------------------------------------------------
    // Fichiers virtuels Emscripten
    // --------------------------------------------------------

    const inputPath =
        "/grille_input.lzfse";

    const outputPath =
        "/grille_output.bin";


    // --------------------------------------------------------
    // Nettoyage
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // Ecriture du fichier LZFSE dans MEMFS
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
    // Décompression
    // --------------------------------------------------------

    console.log(
        "Décompression LZFSE..."
    );


    const decodedSize =
    lzfseModule.decodeLZFSEFile(
        inputPath,
        outputPath,
        originalSize
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


    // --------------------------------------------------------
    // Lire le résultat
    // --------------------------------------------------------

    const decoded =
        lzfseModule.FS.readFile(
            outputPath
        );


    console.log(
        "Buffer décompressé récupéré :",
        decoded.length,
        "octets"
    );


    // --------------------------------------------------------
    // Vérification taille
    // --------------------------------------------------------

    if (
        decoded.length !==
        originalSize
    ) {

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


    // --------------------------------------------------------
    // Afficher les premiers octets
    // --------------------------------------------------------

    let hex = "";

    const count =
        Math.min(
            32,
            decoded.length
        );


    for (let i = 0;
         i < count;
         i++) {

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


    // --------------------------------------------------------
    // Nettoyage MEMFS
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // Retourner une copie indépendante du buffer WASM
    // --------------------------------------------------------

    return new Uint8Array(decoded);
}
