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
   Éléments .grille
   -------------------------------------------------- */

const openGrilleButton =
    document.getElementById("openGrilleButton");

const grilleInput =
    document.getElementById("grilleInput");


/* --------------------------------------------------
   Vérification HTML
   -------------------------------------------------- */

if (!canvas) {
    console.error("ERREUR : #canvas introuvable");
}

if (!workspace) {
    console.error("ERREUR : #workspace introuvable");
}

if (!openButton) {
    console.error("ERREUR : #openButton introuvable");
}

if (!imageInput) {
    console.error("ERREUR : #imageInput introuvable");
}

if (!openGrilleButton) {
    console.error(
        "ERREUR : #openGrilleButton introuvable"
    );
}

if (!grilleInput) {
    console.error(
        "ERREUR : #grilleInput introuvable"
    );
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


/* ==================================================
   OUVERTURE D'UNE IMAGE
   ================================================== */

if (openButton && imageInput) {

    openButton.addEventListener(
        "click",
        () => {

            console.log(
                "CLICK : Ouvrir une image"
            );

            imageInput.value = "";

            imageInput.click();

        }
    );


    imageInput.addEventListener(
        "change",
        event => {

            const file =
                event.target.files[0];

            if (!file) {
                return;
            }


            console.log(
                "Image sélectionnée :",
                file.name,
                file.size,
                file.type
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


                URL.revokeObjectURL(url);


                checkedTiles.clear();


                recomputeGrid();

                resetView();

                updateInfo();

                draw();

            };


            img.onerror = () => {

                console.error(
                    "Impossible de charger l'image"
                );

                URL.revokeObjectURL(url);

                info.textContent =
                    "Erreur de chargement";

            };


            img.src = url;

        }
    );

}


/* ==================================================
   OUVERTURE D'UNE GRILLE
   ================================================== */

if (openGrilleButton && grilleInput) {

    openGrilleButton.addEventListener(
        "click",
        () => {

            console.log(
                "CLICK : Ouvrir une grille"
            );


            /*
             * Important sur iPad :
             *
             * remettre value à vide permet de
             * sélectionner à nouveau le même fichier.
             */

            grilleInput.value = "";


            grilleInput.click();

        }
    );


    grilleInput.addEventListener(
        "change",
        event => {

            const file =
                event.target.files[0];


            if (!file) {

                console.log(
                    "Aucun fichier .grille sélectionné"
                );

                return;

            }


            console.log(
                "================================"
            );

            console.log(
                "FICHIER GRILLE SÉLECTIONNÉ"
            );

            console.log(
                "Nom   :",
                file.name
            );

            console.log(
                "Taille:",
                file.size
            );

            console.log(
                "Type  :",
                file.type
            );

            console.log(
                "================================"
            );


            info.textContent =
                `Grille : ${file.name}`;


            /*
             * Pour l'instant nous ne décodons
             * pas encore le fichier.
             *
             * La prochaine étape sera :
             *
             * .grille
             *   ↓
             * 8 octets taille originale
             *   ↓
             * données LZFSE
             *   ↓
             * archive
             *   ↓
             * GRILLE
             * COULEUR
             * PALETTE
             * ENCOURS
             * TILESIZE
             */

        }
    );

}


/* ==================================================
   TAILLE DES CASES
   ================================================== */

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

}


/* ==================================================
   GRILLE
   ================================================== */

function recomputeGrid() {

    if (!sourceImage) {
        return;
    }


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
   RÉINITIALISATION DE LA VUE
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
   INFORMATIONS
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

    if (!canvas || !workspace) {
        return;
    }


    const width =
        workspace.clientWidth;


    const height =
        workspace.clientHeight;


    /*
     * Taille réelle du canvas.
     */

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


    if (!sourceImage) {
        return;
    }


    ctx.save();


    /*
     * Transformation :
     *
     * coordonnées image
     *        ↓
     * coordonnées écran
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
                    index / cols
                );


            const col =
                index % cols;


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


            if (w <= 0 || h <= 0) {
                return;
            }


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

    if (cols <= 0 || rows <= 0) {
        return;
    }


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


    /*
     * Lignes horizontales
     */

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
   CONVERSION ÉCRAN → IMAGE
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
   RECHERCHE D'UNE CASE
   ================================================== */

function tileAtScreenPoint(
    screenX,
    screenY
) {

    if (!sourceImage) {
        return -1;
    }


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
   SÉLECTION D'UNE CASE
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


    if (index < 0) {
        return;
    }


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

if (clearButton) {

    clearButton.addEventListener(
        "click",
        () => {

            checkedTiles.clear();

            updateInfo();

            draw();

        }
    );

}


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
         *
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
         *
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

        if (
            !pointers.has(
                event.pointerId
            )
        ) {

            return;

        }


        pointers.set(
            event.pointerId,
            {
                x: event.clientX,
                y: event.clientY
            }
        );


        /*
         * Deux doigts :
         *
         * zoom.
         */

        if (pointers.size === 2) {

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


        /*
         * Un doigt :
         *
         * pas de déplacement pour
         * le moment.
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


        if (
            pointers.size < 2
        ) {

            pinchStartDistance = 0;

        }

    }
);


/* --------------------------------------------------
   Pointer Cancel
   -------------------------------------------------- */

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
   DISTANCE ENTRE LES DEUX DOIGTS
   ================================================== */

function pointerDistance() {

    const values =
        Array.from(
            pointers.values()
        );


    if (
        values.length < 2
    ) {

        return 0;

    }


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
   RESIZE ÉCRAN
   ================================================== */

window.addEventListener(
    "resize",
    () => {

        draw();

    }
);


/* ==================================================
   DESSIN INITIAL
   ================================================== */

draw();
