import createLZFSEModule from "./lzfse/lzfse.js";


// ============================================================
// VARIABLES
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


// ============================================================
// CAMERA
// ============================================================

let zoomFactor = 1.0;

let panX = 0;
let panY = 0;


// ============================================================
// POINTERS
// ============================================================
//
// Pointer Events permet de gérer :
//
// Mac :
//   souris = 1 pointer
//
// iPad :
//   doigt 1 = 1 pointer
//   doigt 2 = 2 pointers
//
// ============================================================

const activePointers = new Map();

let singlePointerId = null;

let singlePointerStartX = 0;
let singlePointerStartY = 0;

let singlePointerLastX = 0;
let singlePointerLastY = 0;

let singlePointerMoved = false;


// ------------------------------------------------------------
// Pinch
// ------------------------------------------------------------

let lastPinchDistance = 0;

let lastPinchCenterX = 0;
let lastPinchCenterY = 0;


// ============================================================
// INITIALISATION
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    async function ()
    {
        console.log(
            "Pixeliser démarrage..."
        );


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
                "Impossible de créer le contexte 2D."
            );

            return;
        }


        // ====================================================
        // BOUTONS
        // ====================================================

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


        // ====================================================
        // OUVRIR IMAGE
        // ====================================================

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


        // ====================================================
        // OUVRIR GRILLE
        // ====================================================

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


        // ====================================================
        // EFFACER
        // ====================================================

        if (clearButton)
        {
            clearButton.addEventListener(
                "click",
                clearSelection
            );
        }


        // ====================================================
        // TAILLE DES CASES
        // ====================================================

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
                        !Number.isFinite(
                            value
                        ) ||
                        value < 2
                    )
                    {
                        return;
                    }


                    tileSize =
                        value;


                    recomputeGrid();

                    resetCamera();

                    draw();
                }
            );
        }


        // ====================================================
        // POINTER EVENTS
        // ====================================================

        canvas.addEventListener(
            "pointerdown",
            handlePointerDown
        );


        canvas.addEventListener(
            "pointermove",
            handlePointerMove
        );


        canvas.addEventListener(
            "pointerup",
            handlePointerUp
        );


        canvas.addEventListener(
            "pointercancel",
            handlePointerUp
        );


        canvas.addEventListener(
            "pointerleave",
            handlePointerLeave
        );


        // Empêche certains comportements souris
        canvas.addEventListener(
            "contextmenu",
            function (event)
            {
                event.preventDefault();
            }
        );


        // ====================================================
        // REDIMENSIONNEMENT
        // ====================================================

        window.addEventListener(
            "resize",
            function ()
            {
                draw();
            }
        );


        // ====================================================
        // LZFSE
        // ====================================================

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
// CAMERA
// ============================================================

function resetCamera()
{
    if (!canvas)
    {
        return;
    }


    const workspace =
        document.getElementById(
            "workspace"
        );


    if (!workspace)
    {
        zoomFactor = 1.0;

        panX = 0;
        panY = 0;

        return;
    }


    const rect =
        workspace.getBoundingClientRect();


    if (
        canvas.width <= 0 ||
        canvas.height <= 0
    )
    {
        zoomFactor = 1.0;

        panX = 0;
        panY = 0;

        return;
    }


    const margin = 20;


    const availableWidth =
        Math.max(
            1,
            rect.width - margin * 2
        );


    const availableHeight =
        Math.max(
            1,
            rect.height - margin * 2
        );


    const scaleX =
        availableWidth /
        canvas.width;


    const scaleY =
        availableHeight /
        canvas.height;


    zoomFactor =
        Math.min(
            1.0,
            scaleX,
            scaleY
        );


    panX =
        (
            rect.width -
            canvas.width *
            zoomFactor
        ) * 0.5;


    panY =
        (
            rect.height -
            canvas.height *
            zoomFactor
        ) * 0.5;


    console.log(
        "Camera reset :",
        zoomFactor,
        panX,
        panY
    );
}


// ============================================================
// COORDONNEES ECRAN -> CANVAS
// ============================================================

function canvasPointFromClient(
    clientX,
    clientY
)
{
    const rect =
        canvas.getBoundingClientRect();


    const screenX =
        clientX -
        rect.left;


    const screenY =
        clientY -
        rect.top;


    return {
        x:
            (
                screenX -
                panX
            ) /
            zoomFactor,

        y:
            (
                screenY -
                panY
            ) /
            zoomFactor
    };
}


// ============================================================
// INDEX CASE
// ============================================================

function tileIndexForPoint(
    x,
    y
)
{
    const col =
        Math.floor(
            x /
            tileSize
        );


    const row =
        Math.floor(
            y /
            tileSize
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
        row *
        cols +
        col
    );
}


// ============================================================
// SELECTION
// ============================================================

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


    if (
        index < 0
    )
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


// ------------------------------------------------------------
// Sélection sans basculer une cellule déjà sélectionnée
// ------------------------------------------------------------

function selectTileAt(
    x,
    y
)
{
    const index =
        tileIndexForPoint(
            x,
            y
        );


    if (
        index < 0
    )
    {
        return;
    }


    if (
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


// ============================================================
// POINTER DOWN
// ============================================================

function handlePointerDown(
    event
)
{
    event.preventDefault();


    console.log(
        "pointerdown :",
        event.pointerId,
        event.pointerType,
        event.clientX,
        event.clientY
    );


    // --------------------------------------------------------
    // Capture du pointer
    // --------------------------------------------------------

    try
    {
        canvas.setPointerCapture(
            event.pointerId
        );
    }
    catch (error)
    {
    }


    activePointers.set(
        event.pointerId,
        {
            id:
                event.pointerId,

            x:
                event.clientX,

            y:
                event.clientY,

            type:
                event.pointerType
        }
    );


    // --------------------------------------------------------
    // Deux pointers -> pinch
    // --------------------------------------------------------

    if (
        activePointers.size === 2
    )
    {
        const pointers =
            Array.from(
                activePointers.values()
            );


        const p1 =
            pointers[0];


        const p2 =
            pointers[1];


        lastPinchDistance =
            distanceBetweenPoints(
                p1.x,
                p1.y,
                p2.x,
                p2.y
            );


        const rect =
            canvas.getBoundingClientRect();


        lastPinchCenterX =
            (
                p1.x +
                p2.x
            ) * 0.5 -
            rect.left;


        lastPinchCenterY =
            (
                p1.y +
                p2.y
            ) * 0.5 -
            rect.top;


        singlePointerId =
            null;


        singlePointerMoved =
            false;


        console.log(
            "PINCH START",
            lastPinchDistance,
            lastPinchCenterX,
            lastPinchCenterY
        );


        return;
    }


    // --------------------------------------------------------
    // Premier pointer
    // --------------------------------------------------------

    if (
        activePointers.size === 1
    )
    {
        singlePointerId =
            event.pointerId;


        singlePointerMoved =
            false;


        singlePointerStartX =
            event.clientX;


        singlePointerStartY =
            event.clientY;


        singlePointerLastX =
            event.clientX;


        singlePointerLastY =
            event.clientY;
    }
}


// ============================================================
// POINTER MOVE
// ============================================================

function handlePointerMove(
    event
)
{
    event.preventDefault();


    const pointer =
        activePointers.get(
            event.pointerId
        );


    if (!pointer)
    {
        return;
    }


    pointer.x =
        event.clientX;


    pointer.y =
        event.clientY;


    // ========================================================
    // PINCH
    // ========================================================

    if (
        activePointers.size >= 2
    )
    {
        const pointers =
            Array.from(
                activePointers.values()
            );


        const p1 =
            pointers[0];


        const p2 =
            pointers[1];


        const distance =
            distanceBetweenPoints(
                p1.x,
                p1.y,
                p2.x,
                p2.y
            );


        if (
            lastPinchDistance > 0 &&
            distance > 0
        )
        {
            const rect =
                canvas.getBoundingClientRect();


            const centerX =
                (
                    p1.x +
                    p2.x
                ) * 0.5 -
                rect.left;


            const centerY =
                (
                    p1.y +
                    p2.y
                ) * 0.5 -
                rect.top;


            // ------------------------------------------------
            // Point du monde actuellement sous le centre
            // ------------------------------------------------

            const worldX =
                (
                    centerX -
                    panX
                ) /
                zoomFactor;


            const worldY =
                (
                    centerY -
                    panY
                ) /
                zoomFactor;


            // ------------------------------------------------
            // Zoom
            // ------------------------------------------------

            const ratio =
                distance /
                lastPinchDistance;


            let newZoom =
                zoomFactor *
                ratio;


            newZoom =
                Math.max(
                    0.25,
                    Math.min(
                        5.0,
                        newZoom
                    )
                );


            zoomFactor =
                newZoom;


            // ------------------------------------------------
            // Le point sous les doigts reste fixe
            // ------------------------------------------------

            panX =
                centerX -
                worldX *
                zoomFactor;


            panY =
                centerY -
                worldY *
                zoomFactor;


            // ------------------------------------------------
            // Déplacement du centre du pinch
            // ------------------------------------------------

            const deltaCenterX =
                centerX -
                lastPinchCenterX;


            const deltaCenterY =
                centerY -
                lastPinchCenterY;


            panX +=
                deltaCenterX;


            panY +=
                deltaCenterY;


            lastPinchDistance =
                distance;


            lastPinchCenterX =
                centerX;


            lastPinchCenterY =
                centerY;


            draw();
        }


        return;
    }


    // ========================================================
    // UN SEUL POINTER
    // ========================================================

    if (
        activePointers.size === 1 &&
        event.pointerId === singlePointerId
    )
    {
        const dx =
            event.clientX -
            singlePointerStartX;


        const dy =
            event.clientY -
            singlePointerStartY;


        if (
            Math.abs(dx) > 5 ||
            Math.abs(dy) > 5
        )
        {
            singlePointerMoved =
                true;
        }


        // ----------------------------------------------------
        // Sélection continue
        // ----------------------------------------------------

        if (
            singlePointerMoved
        )
        {
            const point =
                canvasPointFromClient(
                    event.clientX,
                    event.clientY
                );


            selectTileAt(
                point.x,
                point.y
            );
        }


        singlePointerLastX =
            event.clientX;


        singlePointerLastY =
            event.clientY;
    }
}


// ============================================================
// POINTER UP
// ============================================================

function handlePointerUp(
    event
)
{
    event.preventDefault();


    const pointer =
        activePointers.get(
            event.pointerId
        );


    // --------------------------------------------------------
    // Clic simple / tap simple
    // --------------------------------------------------------

    if (
        activePointers.size === 1 &&
        pointer &&
        event.pointerId === singlePointerId &&
        !singlePointerMoved
    )
    {
        const point =
            canvasPointFromClient(
                event.clientX,
                event.clientY
            );


        toggleTileAt(
            point.x,
            point.y
        );
    }


    activePointers.delete(
        event.pointerId
    );


    try
    {
        canvas.releasePointerCapture(
            event.pointerId
        );
    }
    catch (error)
    {
    }


    // --------------------------------------------------------
    // Fin du pinch
    // --------------------------------------------------------

    if (
        activePointers.size < 2
    )
    {
        lastPinchDistance =
            0;
    }


    // --------------------------------------------------------
    // Plus aucun pointer
    // --------------------------------------------------------

    if (
        activePointers.size === 0
    )
    {
        singlePointerId =
            null;


        singlePointerMoved =
            false;
    }
}


// ============================================================
// POINTER LEAVE
// ============================================================

function handlePointerLeave(
    event
)
{
    // Ne rien faire :
    // setPointerCapture permet de continuer à recevoir
    // les mouvements après sortie du canvas.
}


// ============================================================
// DISTANCE ENTRE DEUX POINTS
// ============================================================

function distanceBetweenPoints(
    x1,
    y1,
    x2,
    y2
)
{
    const dx =
        x1 - x2;


    const dy =
        y1 - y2;


    return Math.sqrt(
        dx * dx +
        dy * dy
    );
}


// ============================================================
// DRAW
// ============================================================

function draw()
{
    console.log(
        "========== DRAW =========="
    );


    if (!ctx)
    {
        return;
    }


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


    if (!sourceImage)
    {
        return;
    }


    ctx.save();


    // ========================================================
    // CAMERA
    // ========================================================

    ctx.translate(
        panX,
        panY
    );


    ctx.scale(
        zoomFactor,
        zoomFactor
    );


    // ========================================================
    // IMAGE PRINCIPALE
    // ========================================================

    ctx.drawImage(
        sourceImage,
        0,
        0,
        canvas.width,
        canvas.height
    );


    // ========================================================
    // CELLULES SELECTIONNEES
    // ========================================================
    //
    // Si COULEUR existe, on utilise cette image.
    //
    // Sinon on garde provisoirement un rouge translucide.
    //
    // ========================================================

    if (
        selectedTiles &&
        selectedTiles.size > 0
    )
    {
        if (
            colorImage
        )
        {
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
                    index %
                    cols;


                const row =
                    Math.floor(
                        index /
                        cols
                    );


                const x =
                    col *
                    tileSize;


                const y =
                    row *
                    tileSize;


                // ------------------------------------------------
                // Correspondance avec colorImage
                // ------------------------------------------------

                const sx =
                    x;


                const sy =
                    y;


                const sw =
                    Math.min(
                        tileSize,
                        colorImage.width -
                        sx
                    );


                const sh =
                    Math.min(
                        tileSize,
                        colorImage.height -
                        sy
                    );


                if (
                    sw > 0 &&
                    sh > 0
                )
                {
                    ctx.drawImage(
                        colorImage,

                        sx,
                        sy,
                        sw,
                        sh,

                        x,
                        y,
                        sw,
                        sh
                    );
                }
            }
        }
        else
        {
            // --------------------------------------------------
            // Secours si COULEUR n'existe pas
            // --------------------------------------------------

            ctx.save();


            ctx.fillStyle =
                "rgba(255, 0, 0, 0.35)";


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
                    index %
                    cols;


                const row =
                    Math.floor(
                        index /
                        cols
                    );


                const x =
                    col *
                    tileSize;


                const y =
                    row *
                    tileSize;


                ctx.fillRect(
                    x,
                    y,
                    tileSize,
                    tileSize
                );
            }


            ctx.restore();
        }
    }


    // ========================================================
    // GRILLE
    // ========================================================

    ctx.save();


    ctx.strokeStyle =
        "rgba(0, 0, 0, 0.35)";


    ctx.lineWidth =
        1 /
        zoomFactor;


    ctx.beginPath();


    for (
        let col = 0;
        col <= cols;
        col++
    )
    {
        const x =
            col *
            tileSize +
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
            row *
            tileSize +
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


    ctx.restore();


    console.log(
        "zoom =",
        zoomFactor,
        "panX =",
        panX,
        "panY =",
        panY
    );


    console.log(
        "cases sélectionnées =",
        selectedTiles.size
    );


    console.log(
        "DRAW terminé"
    );
}


// ============================================================
// CHARGEMENT IMAGE SIMPLE
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


            resetCamera();


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
// RECOMPUTE GRID
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
        cols *
        tileSize;


    canvas.height =
        rows *
        tileSize;


    console.log(
        "Grille :",
        cols,
        "x",
        rows,
        "cases"
    );


    console.log(
        "Canvas :",
        canvas.width,
        "x",
        canvas.height
    );
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


// ============================================================
// LZFSE
// ============================================================

async function initializeLZFSE()
{
    console.log(
        "Chargement du module LZFSE..."
    );


    const module =
        await createLZFSEModule();


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
            "MEMFS indisponible."
        );
    }


    lzfseModule =
        module;


    console.log(
        "LZFSE prêt"
    );
}


async function decompressLZFSE(
    compressed,
    originalSize
)
{
    if (!lzfseModule)
    {
        throw new Error(
            "LZFSE non initialisé."
        );
    }


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


    lzfseModule.FS.writeFile(
        inputPath,
        compressed
    );


    console.log(
        "Fichier MEMFS créé :",
        inputPath
    );


    const decodedSize =
        lzfseModule._decode_lzfse_memfs(
            originalSize
        );


    console.log(
        "Résultat LZFSE :",
        decodedSize
    );


    if (
        decodedSize <= 0
    )
    {
        throw new Error(
            "Échec décompression LZFSE."
        );
    }


    const decoded =
        lzfseModule.FS.readFile(
            outputPath
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
