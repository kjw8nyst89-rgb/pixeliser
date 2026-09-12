import createLZFSEModule from "./lzfse/lzfse.js";

const version = "V5";


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


// ============================================================
// CAMERA
// ============================================================

let zoomFactor = 1.0;

let panX = 0;
let panY = 0;


// ============================================================
// POINTERS
// ============================================================

let activePointers = new Map();

let singlePointer = null;

let singlePointerMoved = false;

let lastPointerWorldX = 0;
let lastPointerWorldY = 0;


// ============================================================
// PINCH
// ============================================================

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

        console.log(
            "Version",
            version
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


        // ----------------------------------------------------
        // Image
        // ----------------------------------------------------

        if (openButton && imageInput)
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
                        event.target.files &&
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


        // ----------------------------------------------------
        // Grille
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
        }


        if (grilleInput)
        {
            grilleInput.addEventListener(
                "change",
                async function (event)
                {
                    const file =
                        event.target.files &&
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
                clearSelection
            );
        }


        // ----------------------------------------------------
        // Taille
        // ----------------------------------------------------

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

                    resetCamera();

                    draw();
                }
            );
        }


        // ----------------------------------------------------
        // WORKSPACE
        //
        // IMPORTANT :
        // Les Pointer Events sont installés sur le workspace,
        // pas sur le canvas transformé.
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


            workspace.addEventListener(
                "wheel",
                handleTrackpadWheel,
                {
                    passive: false
                }
            );
        }


        // ----------------------------------------------------
        // Resize
        // ----------------------------------------------------

        window.addEventListener(
            "resize",
            function ()
            {
                if (sourceImage)
                {
                    resizeCanvasToGrid();

                    resetCamera();
                }


                draw();
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


        console.log(
            "Pixeliser initialisé."
        );
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
        "Taille décompressée :",
        decodedSize
    );


    if (
        decodedSize <= 0
    )
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
// GRILLE / CANVAS MONDE / CAMÉRA
// ============================================================

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


// ------------------------------------------------------------
// Le canvas représente maintenant le MONDE COMPLET.
// Il n'est plus redimensionné à la taille du viewport.
// ------------------------------------------------------------

function resizeCanvasToGrid() {
    if (!canvas || cols <= 0 || rows <= 0) {
        return;
    }

    const dpr = window.devicePixelRatio || 1;

    const worldWidth = cols * tileSize;
    const worldHeight = rows * tileSize;

    // Taille interne réelle du canvas
    canvas.width = Math.max(1, Math.round(worldWidth * dpr));
    canvas.height = Math.max(1, Math.round(worldHeight * dpr));

    // Taille CSS = taille du monde logique
    canvas.style.width = `${worldWidth}px`;
    canvas.style.height = `${worldHeight}px`;

    applyCamera();
}


// ------------------------------------------------------------
// Dimensions du viewport visible
// ------------------------------------------------------------

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


// ------------------------------------------------------------
// Réinitialisation de la caméra
// ------------------------------------------------------------

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

    // Évite des valeurs absurdes.
    zoomFactor = Math.max(0.05, Math.min(10, zoomFactor));

    // Centre le monde dans le viewport.
    panX = (viewport.width - worldWidth * zoomFactor) * 0.5;
    panY = (viewport.height - worldHeight * zoomFactor) * 0.5;

    applyCamera();
}


// ------------------------------------------------------------
// Application de la caméra.
//
// IMPORTANT :
// Le canvas reste physiquement le monde complet.
// Le déplacement et le zoom sont uniquement CSS.
// ------------------------------------------------------------

function applyCamera() {
    if (!canvas) {
        return;
    }

    canvas.style.transform =
        `translate(${panX}px, ${panY}px) scale(${zoomFactor})`;
}


// ------------------------------------------------------------
// Conversion coordonnées écran -> coordonnées monde.
//
// IMPORTANT : ne surtout PAS utiliser
// canvas.getBoundingClientRect() ici.
//
// Le canvas est transformé par CSS, donc son rect change avec
// le zoom et le déplacement.
// ------------------------------------------------------------

function canvasPointFromClient(clientX, clientY) {
    const rect = workspace.getBoundingClientRect();

    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    return {
        x: (screenX - panX) / zoomFactor,
        y: (screenY - panY) / zoomFactor
    };
}


// ------------------------------------------------------------
// Conversion monde -> coordonnées écran
// ------------------------------------------------------------

function worldPointToScreen(x, y) {
    return {
        x: panX + x * zoomFactor,
        y: panY + y * zoomFactor
    };
}


// ------------------------------------------------------------
// Limitation du zoom
// ------------------------------------------------------------

function clampZoom(value) {
    return Math.max(0.05, Math.min(10.0, value));
}


// ------------------------------------------------------------
// Recentrage lors d'un changement de taille de fenêtre
// ------------------------------------------------------------

function handleWorkspaceResize() {
    if (!canvas || cols <= 0 || rows <= 0) {
        return;
    }

    // On conserve le point actuellement visible au centre.
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
// ============================================================
// INTERACTION — POINTER EVENTS
// ============================================================

const activePointers = new Map();

let singlePointerId = null;
let singlePointerMoved = false;
let singlePointerWorld = null;

let pinchActive = false;
let lastPinchDistance = 0;
let lastPinchCenter = null;


// ------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------

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
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    return Math.hypot(dx, dy);
}


function centerBetweenPointers(a, b) {
    return {
        x: (a.x + b.x) * 0.5,
        y: (a.y + b.y) * 0.5
    };
}


// ------------------------------------------------------------
// POINTER DOWN
// ------------------------------------------------------------

workspace.addEventListener("pointerdown", function(event) {

    if (!sourceImage) {
        return;
    }

    // On capture le pointeur sur le workspace.
    workspace.setPointerCapture(event.pointerId);

    const screen = pointerScreenPoint(event);

    activePointers.set(event.pointerId, {
        id: event.pointerId,
        pointerType: event.pointerType,
        x: screen.x,
        y: screen.y
    });

    // --------------------------------------------------------
    // Premier doigt / pointeur
    // --------------------------------------------------------

    if (activePointers.size === 1) {

        singlePointerId = event.pointerId;
        singlePointerMoved = false;

        singlePointerWorld = pointerWorldPoint(event);

        pinchActive = false;

        // Pour souris/stylet : comportement clic immédiat.
        //
        // Pour le doigt, on attend pointerup afin qu'un second
        // doigt puisse transformer le geste en pincement.
        if (event.pointerType !== "touch") {

            toggleTileAt(
                singlePointerWorld.x,
                singlePointerWorld.y
            );
        }

        return;
    }

    // --------------------------------------------------------
    // Deuxième doigt : passage en mode PINCH
    // --------------------------------------------------------

    if (activePointers.size === 2) {

        pinchActive = true;

        // Un deuxième doigt annule définitivement le clic simple.
        singlePointerMoved = true;

        const pointers = Array.from(activePointers.values());

        const a = pointers[0];
        const b = pointers[1];

        lastPinchDistance =
            distanceBetweenPointers(a, b);

        lastPinchCenter =
            centerBetweenPointers(a, b);

        return;
    }
});


// ------------------------------------------------------------
// POINTER MOVE
// ------------------------------------------------------------

workspace.addEventListener("pointermove", function(event) {

    const pointer = activePointers.get(event.pointerId);

    if (!pointer || !sourceImage) {
        return;
    }

    const screen = pointerScreenPoint(event);

    pointer.x = screen.x;
    pointer.y = screen.y;

    // --------------------------------------------------------
    // PINCH / PAN À DEUX DOIGTS
    // --------------------------------------------------------

    if (activePointers.size >= 2) {

        const pointers = Array.from(activePointers.values());

        const a = pointers[0];
        const b = pointers[1];

        const distance =
            distanceBetweenPointers(a, b);

        const center =
            centerBetweenPointers(a, b);

        if (lastPinchDistance > 0 && lastPinchCenter) {

            // Point monde qui se trouvait sous le centre du
            // pincement AVANT la modification de la caméra.
            const worldX =
                (lastPinchCenter.x - panX) / zoomFactor;

            const worldY =
                (lastPinchCenter.y - panY) / zoomFactor;

            // Rapport de zoom.
            let newZoom =
                zoomFactor *
                (distance / lastPinchDistance);

            newZoom = clampZoom(newZoom);

            // Le même point monde doit rester sous le nouveau
            // centre du pincement.
            panX = center.x - worldX * newZoom;
            panY = center.y - worldY * newZoom;

            zoomFactor = newZoom;

            applyCamera();
        }

        lastPinchDistance = distance;
        lastPinchCenter = center;

        return;
    }


    // --------------------------------------------------------
    // UN SEUL POINTEUR
    // --------------------------------------------------------

    if (activePointers.size === 1 &&
        event.pointerId === singlePointerId) {

        const world = pointerWorldPoint(event);

        if (singlePointerWorld) {

            const dx = world.x - singlePointerWorld.x;
            const dy = world.y - singlePointerWorld.y;

            if (Math.abs(dx) > 0.5 ||
                Math.abs(dy) > 0.5) {

                singlePointerMoved = true;
            }
        }

        singlePointerWorld = world;

        // ----------------------------------------------------
        // Sélection par déplacement du doigt / souris
        // ----------------------------------------------------

        if (event.pointerType === "touch" ||
            event.buttons !== 0) {

            selectTileAt(world.x, world.y);
        }
    }
});


// ------------------------------------------------------------
// POINTER UP
// ------------------------------------------------------------

workspace.addEventListener("pointerup", function(event) {

    const pointer =
        activePointers.get(event.pointerId);

    if (!pointer) {
        return;
    }

    const wasTouch =
        pointer.pointerType === "touch";

    // --------------------------------------------------------
    // Cas particulier : simple tap tactile
    // --------------------------------------------------------

    if (wasTouch &&
        activePointers.size === 1 &&
        event.pointerId === singlePointerId &&
        !singlePointerMoved &&
        !pinchActive) {

        const world = pointerWorldPoint(event);

        toggleTileAt(world.x, world.y);
    }

    activePointers.delete(event.pointerId);

    // --------------------------------------------------------
    // Fin du pincement
    // --------------------------------------------------------

    if (activePointers.size < 2) {

        lastPinchDistance = 0;
        lastPinchCenter = null;

        if (activePointers.size === 0) {

            pinchActive = false;
            singlePointerId = null;
            singlePointerWorld = null;
            singlePointerMoved = false;

        } else {

            // Il reste un doigt.
            //
            // On ne doit surtout pas transformer la fin du
            // pincement en clic ou en sélection accidentelle.
            pinchActive = false;
            singlePointerMoved = true;

            const remaining =
                Array.from(activePointers.values())[0];

            singlePointerId = remaining.id;

            singlePointerWorld =
                canvasPointFromClient(
                    event.clientX,
                    event.clientY
                );
        }
    }

    try {
        workspace.releasePointerCapture(event.pointerId);
    } catch (_) {
        // Le pointeur peut déjà avoir été libéré par le système.
    }
});


// ------------------------------------------------------------
// POINTER CANCEL
// ------------------------------------------------------------

workspace.addEventListener("pointercancel", function(event) {

    activePointers.delete(event.pointerId);

    if (activePointers.size < 2) {
        lastPinchDistance = 0;
        lastPinchCenter = null;
        pinchActive = false;
    }

    if (activePointers.size === 0) {
        singlePointerId = null;
        singlePointerWorld = null;
        singlePointerMoved = false;
    }

    try {
        workspace.releasePointerCapture(event.pointerId);
    } catch (_) {
    }
});
// ============================================================
// DESSIN
// ============================================================

function draw() {

    if (!canvas || !ctx) {
        return;
    }

    const dpr = window.devicePixelRatio || 1;

    const worldWidth  = cols * tileSize;
    const worldHeight = rows * tileSize;

    if (worldWidth <= 0 || worldHeight <= 0) {
        return;
    }

    // --------------------------------------------------------
    // Le canvas contient le monde complet.
    // Le zoom et le déplacement sont appliqués uniquement
    // par le transform CSS du canvas.
    // --------------------------------------------------------

    ctx.setTransform(
        dpr, 0,
        0, dpr,
        0, 0
    );

    ctx.clearRect(
        0,
        0,
        worldWidth,
        worldHeight
    );


    // --------------------------------------------------------
    // IMAGE PRINCIPALE
    // --------------------------------------------------------

    if (sourceImage) {

        ctx.drawImage(
            sourceImage,
            0,
            0,
            worldWidth,
            worldHeight
        );
    }


    // --------------------------------------------------------
    // CASES SÉLECTIONNÉES
    //
    // On conserve ici le comportement du V3 :
    // si colorImage existe, on affiche la portion
    // correspondante de colorImage.
    // Sinon on utilise le voile rouge.
    // --------------------------------------------------------

    if (selectedTiles.size > 0) {

        if (colorImage) {

            for (const index of selectedTiles) {

                if (index < 0 || index >= cols * rows) {
                    continue;
                }

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

                if (index < 0 || index >= cols * rows) {
                    continue;
                }

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


    // --------------------------------------------------------
    // GRILLE
    // --------------------------------------------------------

    ctx.beginPath();

    // Avec le zoom CSS, une ligne de 1 unité devient
    // plus épaisse à l'écran. On compense donc ici.
    ctx.lineWidth = 1 / Math.max(zoomFactor, 0.0001);

    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";

    // Lignes verticales
    for (let col = 0; col <= cols; col++) {

        const x = col * tileSize + 0.5;

        ctx.moveTo(x, 0);
        ctx.lineTo(x, worldHeight);
    }

    // Lignes horizontales
    for (let row = 0; row <= rows; row++) {

        const y = row * tileSize + 0.5;

        ctx.moveTo(0, y);
        ctx.lineTo(worldWidth, y);
    }

    ctx.stroke();


    // --------------------------------------------------------
    // BORDURE DU MONDE
    // --------------------------------------------------------

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


// ============================================================
// INITIALISATION DU CONTEXTE CANVAS
// ============================================================

function initCanvas() {

    canvas = document.getElementById("canvas");

    if (!canvas) {
        console.error("Canvas introuvable");
        return;
    }

    ctx = canvas.getContext("2d", {
        alpha: false,
        desynchronized: true
    });

    if (!ctx) {
        console.error("Impossible de créer le contexte 2D");
        return;
    }

    // Pas de gestion Touch Events :
    // Pointer Events s'en occupent entièrement.
    canvas.style.touchAction = "none";
    workspace.style.touchAction = "none";
}


// ============================================================
// EFFACEMENT
// ============================================================

function clearAll() {

    sourceImage = null;
    colorImage = null;
    paletteImage = null;

    selectedTiles.clear();

    cols = 0;
    rows = 0;

    zoomFactor = 1;
    panX = 0;
    panY = 0;

    canvas.width = 1;
    canvas.height = 1;

    canvas.style.width = "1px";
    canvas.style.height = "1px";

    applyCamera();

    if (info) {
        info.textContent = "Aucune image";
    }

    draw();
}


// ============================================================
// REDIMENSIONNEMENT APRÈS CHANGEMENT DE TILE SIZE
// ============================================================

function updateTileSize() {

    const value = parseInt(tileSizeInput.value, 10);

    if (!Number.isFinite(value)) {
        return;
    }

    tileSize = Math.max(
        2,
        Math.min(100, value)
    );

    if (!sourceImage) {
        return;
    }

    recomputeGrid();
    draw();
}


// ============================================================
// ÉVÉNEMENTS UI
// ============================================================

openButton.addEventListener("click", function() {
    imageInput.click();
});

openGrilleButton.addEventListener("click", function() {
    grilleInput.click();
});

clearButton.addEventListener("click", function() {
    clearAll();
});

tileSizeInput.addEventListener("change", function() {
    updateTileSize();
});

tileSizeInput.addEventListener("input", function() {
    updateTileSize();
});


// ============================================================
// INITIALISATION
// ============================================================

initCanvas();
draw();
