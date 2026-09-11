"use strict";


/* ==================================================
   PIXELISER
   ================================================== */


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

let checkedTiles = new Set();


/* --------------------------------------------------
   Affichage
   -------------------------------------------------- */

let zoom = 1.0;

let offsetX = 0;
let offsetY = 0;


/* --------------------------------------------------
   Interaction tactile
   -------------------------------------------------- */

let pointers = new Map();

let lastPointerX = 0;
let lastPointerY = 0;

let pinchStartDistance = 0;
let pinchStartZoom = 1;


/* --------------------------------------------------
   Ouverture image
   -------------------------------------------------- */

openButton.addEventListener(
    "click",
    () => {

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

            URL.revokeObjectURL(url);

            checkedTiles.clear();

            recomputeGrid();

            resetView();

            updateInfo();

            draw();

        };

        img.src = url;

    }
);


/* --------------------------------------------------
   Taille des cases
   -------------------------------------------------- */

tileSizeInput.addEventListener(
    "change",
    () => {

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
                Math.min(100, value)
            );

        tileSize = value;

        tileSizeInput.value =
            tileSize;

        checkedTiles.clear();

        recomputeGrid();

        updateInfo();

        draw();

    }
);


/* --------------------------------------------------
   Grille
   -------------------------------------------------- */

function recomputeGrid() {

    if (!sourceImage)
        return;

    cols =
        Math.ceil(
            imageWidth / tileSize
        );

    rows =
        Math.ceil(
            imageHeight / tileSize
        );

}


/* --------------------------------------------------
   Réinitialisation de la vue
   -------------------------------------------------- */

function resetView() {

    zoom = 1;

    /*
     * On centre l'image dans la zone
     * disponible.
     */

    const w =
        imageWidth * zoom;

    const h =
        imageHeight * zoom;

    offsetX =
        (workspace.clientWidth - w) / 2;

    offsetY =
        (workspace.clientHeight - h) / 2;

}


/* --------------------------------------------------
   Information
   -------------------------------------------------- */

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


/* --------------------------------------------------
   Dessin
   -------------------------------------------------- */

function draw() {

    const width =
        workspace.clientWidth;

    const height =
        workspace.clientHeight;


    canvas.width =
        width;

    canvas.height =
        height;


    ctx.clearRect(
        0,
        0,
        width,
        height
    );


    if (!sourceImage)
        return;


    ctx.save();


    /*
     * Transformation image → écran
     */

    ctx.translate(
        offsetX,
        offsetY
    );

    ctx.scale(
        zoom,
        zoom
    );


    /*
     * Image originale
     */

    ctx.drawImage(
        sourceImage,
        0,
        0
    );


    /*
     * Cases sélectionnées
     */

    drawCheckedTiles();


    /*
     * Grille
     */

    drawGrid();


    ctx.restore();

}


/* --------------------------------------------------
   Cases sélectionnées
   -------------------------------------------------- */

function drawCheckedTiles() {

    /*
     * On utilise une couleur semi-transparente.
     */

    ctx.fillStyle =
        "rgba(255, 60, 60, 0.35)";


    checkedTiles.forEach(
        index => {

            const row =
                Math.floor(index / cols);

            const col =
                index % cols;


            const x =
                col * tileSize;

            const y =
                row * tileSize;


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


            ctx.fillRect(
                x,
                y,
                w,
                h
            );

        }
    );

}


/* --------------------------------------------------
   Grille
   -------------------------------------------------- */

function drawGrid() {

    ctx.beginPath();


    /*
     * Lignes verticales
     */

    for (
        let col = 0;
        col <= cols;
        col++
    ) {

        const x =
            col * tileSize;

        ctx.moveTo(
            x,
            0
        );

        ctx.lineTo(
            x,
            rows * tileSize
        );

    }


    /*
     * Lignes horizontales
     */

    for (
        let row = 0;
        row <= rows;
        row++
    ) {

        const y =
            row * tileSize;

        ctx.moveTo(
            0,
            y
        );

        ctx.lineTo(
            cols * tileSize,
            y
        );

    }


    ctx.lineWidth =
        1 / zoom;

    ctx.strokeStyle =
        "rgba(0, 0, 0, 0.35)";

    ctx.stroke();

}


/* --------------------------------------------------
   Conversion écran → image
   -------------------------------------------------- */

function imagePointFromScreen(
    screenX,
    screenY
) {

    return {

        x:
            (screenX - offsetX)
            / zoom,

        y:
            (screenY - offsetY)
            / zoom

    };

}


/* --------------------------------------------------
   Recherche d'une case
   -------------------------------------------------- */

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
            point.x / tileSize
        );

    const row =
        Math.floor(
            point.y / tileSize
        );


    if (
        col < 0 ||
        row < 0 ||
        col >= cols ||
        row >= rows
    ) {

        return -1;

    }


    return row * cols + col;

}


/* --------------------------------------------------
   Sélection d'une case
   -------------------------------------------------- */

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


    if (checkedTiles.has(index)) {

        checkedTiles.delete(index);

    }
    else {

        checkedTiles.add(index);

    }


    updateInfo();

    draw();

}


/* --------------------------------------------------
   Effacer
   -------------------------------------------------- */

clearButton.addEventListener(
    "click",
    () => {

        checkedTiles.clear();

        updateInfo();

        draw();

    }
);


/* ==================================================
   GESTION DES POINTERS
   ================================================== */


/* --------------------------------------------------
   Pointer Down
   -------------------------------------------------- */

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


        /*
         * Un seul doigt :
         * sélection d'une case.
         */

        if (pointers.size === 1) {

            toggleTile(
                event.clientX,
                event.clientY
            );

            lastPointerX =
                event.clientX;

            lastPointerY =
                event.clientY;

        }


        /*
         * Deux doigts :
         * début du zoom.
         */

        if (pointers.size === 2) {

            pinchStartDistance =
                pointerDistance();

            pinchStartZoom =
                zoom;

        }

    }
);


/* --------------------------------------------------
   Pointer Move
   -------------------------------------------------- */

canvas.addEventListener(
    "pointermove",
    event => {

        if (!pointers.has(event.pointerId))
            return;


        pointers.set(
            event.pointerId,
            {
                x: event.clientX,
                y: event.clientY
            }
        );


        /*
         * Deux doigts :
         * zoom.
         */

        if (pointers.size === 2) {

            const distance =
                pointerDistance();


            if (pinchStartDistance > 0) {

                const factor =
                    distance /
                    pinchStartDistance;


                zoom =
                    pinchStartZoom *
                    factor;


                zoom =
                    Math.max(
                        0.1,
                        Math.min(10, zoom)
                    );


                draw();

            }

            return;

        }


        /*
         * Un doigt :
         * déplacement.
         *
         * Pour l'instant nous ne faisons
         * pas encore de déplacement avec
         * un doigt.
         */

    }
);


/* --------------------------------------------------
   Pointer Up
   -------------------------------------------------- */

canvas.addEventListener(
    "pointerup",
    event => {

        pointers.delete(
            event.pointerId
        );


        if (pointers.size < 2) {

            pinchStartDistance = 0;

        }

    }
);


canvas.addEventListener(
    "pointercancel",
    event => {

        pointers.delete(
            event.pointerId
        );

    }
);


/* --------------------------------------------------
   Distance entre les deux doigts
   -------------------------------------------------- */

function pointerDistance() {

    const values =
        Array.from(
            pointers.values()
        );


    if (values.length < 2)
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


/* --------------------------------------------------
   Resize écran
   -------------------------------------------------- */

window.addEventListener(
    "resize",
    () => {

        draw();

    }
);


/* --------------------------------------------------
   Dessin initial
   -------------------------------------------------- */

draw();
