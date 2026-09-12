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
let panX = 0;
let panY = 0;


// ============================================================
// INTERACTION
// ============================================================

let activePointers = new Map();

let singlePointer = null;
let singlePointerMoved = false;

let lastPointerWorldX = 0;
let lastPointerWorldY = 0;

let lastPinchDistance = 0;
let lastPinchCenterX = 0;
let lastPinchCenterY = 0;

let touchInteractionActive = false;


// ============================================================
// INITIALISATION
// ============================================================

document.addEventListener("DOMContentLoaded", function ()
{
    console.log("Pixeliser démarrage...");

    canvas = document.getElementById("canvas");
    ctx = canvas.getContext("2d");

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


    // --------------------------------------------------------
    // IMAGE
    // --------------------------------------------------------

    openButton.addEventListener("click", function ()
    {
        imageInput.click();
    });

    imageInput.addEventListener("change", function ()
    {
        const file = imageInput.files[0];

        if (!file)
            return;

        loadImageFile(file);
    });


    // --------------------------------------------------------
    // GRILLE
    // --------------------------------------------------------

    openGrilleButton.addEventListener("click", function ()
    {
        grilleInput.click();
    });

    grilleInput.addEventListener("change", async function ()
    {
        const file = grilleInput.files[0];

        if (!file)
            return;

        try
        {
            await loadGrilleFile(file);
        }
        catch (error)
        {
            console.error("Erreur chargement grille :", error);
            alert("Impossible de charger la grille.");
        }
    });


    // --------------------------------------------------------
    // EFFACER
    // --------------------------------------------------------

    clearButton.addEventListener("click", function ()
    {
        clearSelection();
    });


    // --------------------------------------------------------
    // TAILLE DES CASES
    // --------------------------------------------------------

    tileSizeInput.addEventListener("change", function ()
    {
        let value = parseInt(tileSizeInput.value, 10);

        if (!Number.isFinite(value))
            value = 20;

        value = Math.max(2, Math.min(100, value));

        tileSize = value;

        tileSizeInput.value = value;

        fitGridInWorkspace();

        draw();
    });


    // --------------------------------------------------------
    // POINTER EVENTS
    // --------------------------------------------------------

    canvas.addEventListener(
        "pointerdown",
        handlePointerDown,
        { passive:false }
    );

    canvas.addEventListener(
        "pointermove",
        handlePointerMove,
        { passive:false }
    );

    canvas.addEventListener(
        "pointerup",
        handlePointerUp,
        { passive:false }
    );

    canvas.addEventListener(
        "pointercancel",
        handlePointerUp,
        { passive:false }
    );


    // --------------------------------------------------------
    // TOUCH EVENTS
    // --------------------------------------------------------

    canvas.addEventListener(
        "touchstart",
        handleTouchStart,
        { passive:false }
    );

    canvas.addEventListener(
        "touchmove",
        handleTouchMove,
        { passive:false }
    );

    canvas.addEventListener(
        "touchend",
        handleTouchEnd,
        { passive:false }
    );

    canvas.addEventListener(
        "touchcancel",
        handleTouchEnd,
        { passive:false }
    );


    // --------------------------------------------------------
    // TRACKPAD MAC
    // --------------------------------------------------------

    canvas.addEventListener(
        "wheel",
        handleTrackpadWheel,
        { passive:false }
    );


    // --------------------------------------------------------
    // RESIZE
    // --------------------------------------------------------

    window.addEventListener("resize", function ()
    {
        resizeCanvasToWorkspace();
        draw();
    });


    // --------------------------------------------------------
    // INITIALISATION CANVAS
    // --------------------------------------------------------

    resizeCanvasToWorkspace();


    // --------------------------------------------------------
    // LZFSE
    // --------------------------------------------------------

    initLZFSE();
});


// ============================================================
// REDIMENSIONNEMENT CANVAS
// ============================================================

function resizeCanvasToWorkspace()
{
    if (!canvas)
        return;

    const workspace =
        document.getElementById("workspace");

    if (!workspace)
        return;

    const rect = workspace.getBoundingClientRect();

    const width =
        Math.max(1, Math.floor(rect.width));

    const height =
        Math.max(1, Math.floor(rect.height));

    canvas.width = width;
    canvas.height = height;
}


// ============================================================
// AJUSTEMENT INITIAL DE LA GRILLE
// ============================================================

function fitGridInWorkspace()
{
    if (!canvas || cols <= 0 || rows <= 0)
        return;

    const gridWidth =
        cols * tileSize;

    const gridHeight =
        rows * tileSize;

    const margin = 20;

    const availableWidth =
        canvas.width - margin * 2;

    const availableHeight =
        canvas.height - margin * 2;

    if (availableWidth <= 0 || availableHeight <= 0)
        return;

    const scaleX =
        availableWidth / gridWidth;

    const scaleY =
        availableHeight / gridHeight;

    const scale =
        Math.min(scaleX, scaleY);

    zoomFactor =
        Math.max(0.05, Math.min(10.0, scale));

    panX =
        (canvas.width - gridWidth * zoomFactor) / 2;

    panY =
        (canvas.height - gridHeight * zoomFactor) / 2;
}


// ============================================================
// TRACKPAD MAC
// ============================================================

function handleTrackpadWheel(event)
{
    event.preventDefault();

    const rect =
        canvas.getBoundingClientRect();

    const screenX =
        event.clientX - rect.left;

    const screenY =
        event.clientY - rect.top;


    // --------------------------------------------------------
    // PINCH TRACKPAD
    //
    // Safari transforme généralement le pincement en wheel
    // avec ctrlKey = true.
    // --------------------------------------------------------

    if (event.ctrlKey)
    {
        const worldX =
            (screenX - panX) / zoomFactor;

        const worldY =
            (screenY - panY) / zoomFactor;

        const factor =
            Math.exp(-event.deltaY * 0.01);

        let newZoom =
            zoomFactor * factor;

        newZoom =
            Math.max(
                0.05,
                Math.min(10.0, newZoom)
            );

        panX =
            screenX - worldX * newZoom;

        panY =
            screenY - worldY * newZoom;

        zoomFactor = newZoom;

        draw();

        return;
    }


    // --------------------------------------------------------
    // DEUX DOIGTS TRACKPAD = PAN
    // --------------------------------------------------------

    panX -= event.deltaX;
    panY -= event.deltaY;

    draw();
}


// ============================================================
// POINTER DOWN
// ============================================================

function handlePointerDown(event)
{
    event.preventDefault();

    if (event.pointerType === "mouse")
        return;

    canvas.setPointerCapture(event.pointerId);

    activePointers.set(
        event.pointerId,
        {
            x: event.clientX,
            y: event.clientY
        }
    );

    if (activePointers.size === 1)
    {
        const rect =
            canvas.getBoundingClientRect();

        const screenX =
            event.clientX - rect.left;

        const screenY =
            event.clientY - rect.top;

        lastPointerWorldX =
            (screenX - panX) / zoomFactor;

        lastPointerWorldY =
            (screenY - panY) / zoomFactor;

        singlePointer =
            event.pointerId;

        singlePointerMoved = false;

        touchInteractionActive = true;
    }
    else if (activePointers.size === 2)
    {
        setupPinch();
    }
}


// ============================================================
// POINTER MOVE
// ============================================================

function handlePointerMove(event)
{
    if (event.pointerType === "mouse")
        return;

    if (!activePointers.has(event.pointerId))
        return;

    event.preventDefault();

    activePointers.set(
        event.pointerId,
        {
            x: event.clientX,
            y: event.clientY
        }
    );


    if (activePointers.size === 1)
    {
        const rect =
            canvas.getBoundingClientRect();

        const screenX =
            event.clientX - rect.left;

        const screenY =
            event.clientY - rect.top;

        const worldX =
            (screenX - panX) / zoomFactor;

        const worldY =
            (screenY - panY) / zoomFactor;

        const dx =
            worldX - lastPointerWorldX;

        const dy =
            worldY - lastPointerWorldY;

        if (Math.abs(dx) > 1 || Math.abs(dy) > 1)
            singlePointerMoved = true;

        panX += dx * zoomFactor;
        panY += dy * zoomFactor;

        lastPointerWorldX = worldX;
        lastPointerWorldY = worldY;

        draw();
    }
    else if (activePointers.size === 2)
    {
        handlePinchMove();
    }
}


// ============================================================
// POINTER UP
// ============================================================

function handlePointerUp(event)
{
    if (event.pointerType === "mouse")
        return;

    event.preventDefault();

    activePointers.delete(event.pointerId);

    if (activePointers.size === 0)
    {
        touchInteractionActive = false;

        if (
            singlePointer === event.pointerId &&
            !singlePointerMoved
        )
        {
            const rect =
                canvas.getBoundingClientRect();

            const screenX =
                event.clientX - rect.left;

            const screenY =
                event.clientY - rect.top;

            toggleTileAtScreen(
                screenX,
                screenY
            );
        }

        singlePointer = null;
    }
    else if (activePointers.size === 1)
    {
        const remaining =
            activePointers.values().next().value;

        const rect =
            canvas.getBoundingClientRect();

        const screenX =
            remaining.x - rect.left;

        const screenY =
            remaining.y - rect.top;

        lastPointerWorldX =
            (screenX - panX) / zoomFactor;

        lastPointerWorldY =
            (screenY - panY) / zoomFactor;

        singlePointer =
            [...activePointers.keys()][0];

        singlePointerMoved = true;
    }
}


// ============================================================
// INITIALISATION PINCH
// ============================================================

function setupPinch()
{
    const points =
        [...activePointers.values()];

    if (points.length !== 2)
        return;

    const p1 = points[0];
    const p2 = points[1];

    lastPinchDistance =
        Math.hypot(
            p2.x - p1.x,
            p2.y - p1.y
        );

    lastPinchCenterX =
        (p1.x + p2.x) / 2;

    lastPinchCenterY =
        (p1.y + p2.y) / 2;
}


// ============================================================
// MOUVEMENT PINCH
// ============================================================

function handlePinchMove()
{
    const points =
        [...activePointers.values()];

    if (points.length !== 2)
        return;

    const p1 = points[0];
    const p2 = points[1];


    const distance =
        Math.hypot(
            p2.x - p1.x,
            p2.y - p1.y
        );

    if (lastPinchDistance <= 0)
    {
        setupPinch();
        return;
    }


    const centerX =
        (p1.x + p2.x) / 2 -
        canvas.getBoundingClientRect().left;

    const centerY =
        (p1.y + p2.y) / 2 -
        canvas.getBoundingClientRect().top;


    const oldCenterX =
        lastPinchCenterX -
        canvas.getBoundingClientRect().left;

    const oldCenterY =
        lastPinchCenterY -
        canvas.getBoundingClientRect().top;


    // --------------------------------------------------------
    // POINT DU MONDE QUI SE TROUVAIT SOUS L'ANCIEN CENTRE
    // --------------------------------------------------------

    const worldX =
        (oldCenterX - panX) / zoomFactor;

    const worldY =
        (oldCenterY - panY) / zoomFactor;


    // --------------------------------------------------------
    // ZOOM
    // --------------------------------------------------------

    const ratio =
        distance / lastPinchDistance;

    let newZoom =
        zoomFactor * ratio;

    newZoom =
        Math.max(
            0.05,
            Math.min(10.0, newZoom)
        );


    // --------------------------------------------------------
    // NOUVEAU PAN
    //
    // Le même point monde reste sous le nouveau centre.
    // Cela permet de faire simultanément :
    //   - zoom
    //   - déplacement à deux doigts
    // --------------------------------------------------------

    panX =
        centerX - worldX * newZoom;

    panY =
        centerY - worldY * newZoom;

    zoomFactor = newZoom;


    lastPinchDistance = distance;

    lastPinchCenterX =
        (p1.x + p2.x) / 2;

    lastPinchCenterY =
        (p1.y + p2.y) / 2;


    draw();
}


// ============================================================
// TOUCH START
// ============================================================

function handleTouchStart(event)
{
    event.preventDefault();

    touchInteractionActive = true;

    if (event.touches.length === 2)
    {
        const t1 = event.touches[0];
        const t2 = event.touches[1];

        lastPinchDistance =
            Math.hypot(
                t2.clientX - t1.clientX,
                t2.clientY - t1.clientY
            );

        lastPinchCenterX =
            (t1.clientX + t2.clientX) / 2;

        lastPinchCenterY =
            (t1.clientY + t2.clientY) / 2;
    }
}


// ============================================================
// TOUCH MOVE
// ============================================================

function handleTouchMove(event)
{
    event.preventDefault();

    if (event.touches.length !== 2)
        return;


    const rect =
        canvas.getBoundingClientRect();


    const t1 = event.touches[0];
    const t2 = event.touches[1];


    const distance =
        Math.hypot(
            t2.clientX - t1.clientX,
            t2.clientY - t1.clientY
        );


    if (lastPinchDistance <= 0)
    {
        lastPinchDistance = distance;

        lastPinchCenterX =
            (t1.clientX + t2.clientX) / 2;

        lastPinchCenterY =
            (t1.clientY + t2.clientY) / 2;

        return;
    }


    const centerX =
        (t1.clientX + t2.clientX) / 2 -
        rect.left;

    const centerY =
        (t1.clientY + t2.clientY) / 2 -
        rect.top;


    const oldCenterX =
        lastPinchCenterX -
        rect.left;

    const oldCenterY =
        lastPinchCenterY -
        rect.top;


    // --------------------------------------------------------
    // POINT MONDE SOUS L'ANCIEN CENTRE
    // --------------------------------------------------------

    const worldX =
        (oldCenterX - panX) / zoomFactor;

    const worldY =
        (oldCenterY - panY) / zoomFactor;


    // --------------------------------------------------------
    // NOUVEAU ZOOM
    // --------------------------------------------------------

    const ratio =
        distance / lastPinchDistance;

    let newZoom =
        zoomFactor * ratio;

    newZoom =
        Math.max(
            0.05,
            Math.min(10.0, newZoom)
        );


    // --------------------------------------------------------
    // PAN + ZOOM
    // --------------------------------------------------------

    panX =
        centerX - worldX * newZoom;

    panY =
        centerY - worldY * newZoom;

    zoomFactor = newZoom;


    lastPinchDistance = distance;

    lastPinchCenterX =
        (t1.clientX + t2.clientX) / 2;

    lastPinchCenterY =
        (t1.clientY + t2.clientY) / 2;


    draw();
}


// ============================================================
// TOUCH END
// ============================================================

function handleTouchEnd(event)
{
    event.preventDefault();

    if (event.touches.length < 2)
    {
        lastPinchDistance = 0;
    }

    if (event.touches.length === 0)
    {
        touchInteractionActive = false;
    }
}


// ============================================================
// CLIC SUR UNE CASE
// ============================================================

function toggleTileAtScreen(screenX, screenY)
{
    if (cols <= 0 || rows <= 0)
        return;

    const worldX =
        (screenX - panX) / zoomFactor;

    const worldY =
        (screenY - panY) / zoomFactor;


    const col =
        Math.floor(worldX / tileSize);

    const row =
        Math.floor(worldY / tileSize);


    if (
        col < 0 ||
        col >= cols ||
        row < 0 ||
        row >= rows
    )
    {
        return;
    }


    const index =
        row * cols + col;


    if (selectedTiles.has(index))
        selectedTiles.delete(index);
    else
        selectedTiles.add(index);


    draw();
}


// ============================================================
// DESSIN
// ============================================================

function draw()
{
    if (!ctx || !canvas)
        return;


    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


    // --------------------------------------------------------
    // FOND
    // --------------------------------------------------------

    ctx.fillStyle = "#303030";

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


    if (!sourceImage)
        return;


    // --------------------------------------------------------
    // IMAGE
    // --------------------------------------------------------

    const imageWidth =
        sourceImage.naturalWidth ||
        sourceImage.width;

    const imageHeight =
        sourceImage.naturalHeight ||
        sourceImage.height;


    if (cols <= 0 || rows <= 0)
    {
        ctx.save();

        ctx.translate(panX, panY);

        ctx.scale(
            zoomFactor,
            zoomFactor
        );

        ctx.drawImage(
            sourceImage,
            0,
            0
        );

        ctx.restore();

        return;
    }


    // --------------------------------------------------------
    // IMAGE
    // --------------------------------------------------------

    ctx.save();

    ctx.translate(
        panX,
        panY
    );

    ctx.scale(
        zoomFactor,
        zoomFactor
    );


    ctx.imageSmoothingEnabled = true;

    ctx.drawImage(
        sourceImage,
        0,
        0,
        cols * tileSize,
        rows * tileSize
    );


    // --------------------------------------------------------
    // CASES SELECTIONNEES
    // --------------------------------------------------------

    if (selectedTiles.size > 0)
    {
        ctx.fillStyle =
            "rgba(255,255,255,0.35)";

        for (const index of selectedTiles)
        {
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
        }
    }


    // --------------------------------------------------------
    // GRILLE
    // --------------------------------------------------------

    if (tileSize * zoomFactor >= 4)
    {
        ctx.beginPath();

        for (let x = 0; x <= cols; x++)
        {
            const px =
                x * tileSize;

            ctx.moveTo(
                px,
                0
            );

            ctx.lineTo(
                px,
                rows * tileSize
            );
        }

        for (let y = 0; y <= rows; y++)
        {
            const py =
                y * tileSize;

            ctx.moveTo(
                0,
                py
            );

            ctx.lineTo(
                cols * tileSize,
                py
            );
        }

        ctx.strokeStyle =
            "rgba(0,0,0,0.25)";

        ctx.lineWidth =
            1 / zoomFactor;

        ctx.stroke();
    }


    ctx.restore();
}


// ============================================================
// CHARGEMENT IMAGE
// ============================================================

function loadImageFile(file)
{
    const url =
        URL.createObjectURL(file);

    const image =
        new Image();

    image.onload = function ()
    {
        sourceImage = image;

        cols = Math.floor(
            image.naturalWidth / tileSize
        );

        rows = Math.floor(
            image.naturalHeight / tileSize
        );

        selectedTiles.clear();

        fitGridInWorkspace();

        updateInfo();

        draw();

        URL.revokeObjectURL(url);
    };

    image.onerror = function ()
    {
        console.error(
            "Impossible de charger l'image."
        );

        URL.revokeObjectURL(url);
    };

    image.src = url;
}


// ============================================================
// LZFSE
// ============================================================

async function initLZFSE()
{
    try
    {
        console.log("Chargement du module LZFSE...");

        lzfseModule =
            await createLZFSEModule();

        console.log(
            "decode_lzfse_memfs :",
            typeof lzfseModule._decode_lzfse_memfs
        );

        if (!lzfseModule.FS)
        {
            throw new Error(
                "FS Emscripten indisponible."
            );
        }

        console.log("LZFSE prêt");
    }
    catch (error)
    {
        console.error(
            "Erreur initialisation LZFSE :",
            error
        );
    }
}


// ============================================================
// CHARGEMENT GRILLE
// ============================================================

async function loadGrilleFile(file)
{
    if (!lzfseModule)
    {
        throw new Error(
            "LZFSE n'est pas encore prêt."
        );
    }


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
    // 8 PREMIERS OCTETS = TAILLE DECOMPRIMEE
    // --------------------------------------------------------

    const view =
        new DataView(buffer);

    const expectedSize =
        Number(
            view.getBigUint64(
                0,
                true
            )
        );


    console.log(
        "Taille originale annoncée :",
        expectedSize
    );


    const compressed =
        bytes.subarray(8);


    console.log(
        "Taille LZFSE :",
        compressed.length
    );


    console.log(
        "Signature LZFSE :",
        new TextDecoder().decode(
            compressed.subarray(0, 4)
        )
    );


    // --------------------------------------------------------
    // MEMFS
    // --------------------------------------------------------

    try
    {
        lzfseModule.FS.unlink(
            "/grille_input.lzfse"
        );
    }
    catch (e)
    {
        // Fichier absent : normal.
    }


    try
    {
        lzfseModule.FS.unlink(
            "/grille_output.bin"
        );
    }
    catch (e)
    {
        // Fichier absent : normal.
    }


    console.log(
        "Décompression LZFSE via MEMFS..."
    );


    lzfseModule.FS.writeFile(
        "/grille_input.lzfse",
        compressed
    );


    console.log(
        "Fichier MEMFS créé :",
        "/grille_input.lzfse"
    );


    const result =
        lzfseModule._decode_lzfse_memfs(
            expectedSize
        );


    console.log(
        "Résultat decode_lzfse_memfs :",
        result
    );


    if (!result)
    {
        throw new Error(
            "La décompression LZFSE a échoué."
        );
    }


    const decoded =
        lzfseModule.FS.readFile(
            "/grille_output.bin"
        );


    console.log(
        "Archive décompressée :",
        decoded.length,
        "octets"
    );


    // --------------------------------------------------------
    // NSKEYEDARCHIVER
    // --------------------------------------------------------

    const archive =
        decodeBinaryPlist(decoded);

    const root =
        decodeGrilleArchive(archive);


    console.log(
        "OBJET RACINE NSKEYEDARCHIVER :",
        root
    );


    const data =
        extractGrilleData(root);


    if (!data)
    {
        throw new Error(
            "Impossible d'extraire les données de la grille."
        );
    }


    // --------------------------------------------------------
    // PNG GRILLE
    // --------------------------------------------------------

    console.log(
        "GRILLE : PNG Uint8Array length",
        data.GRILLE?.length
    );

    console.log(
        "COULEUR : PNG Uint8Array length",
        data.COULEUR?.length
    );

    console.log(
        "PALETTE : PNG Uint8Array length",
        data.PALETTE?.length
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


    // --------------------------------------------------------
    // TILE SIZE
    //
    // Mac stocke ici 10.
    // L'iPad utilise 20.
    // --------------------------------------------------------

    if (
        typeof data.TILESIZE === "number" &&
        data.TILESIZE > 0
    )
    {
        tileSize =
            data.TILESIZE * 2;

        const input =
            document.getElementById("tileSize");

        if (input)
            input.value = tileSize;
    }


    // --------------------------------------------------------
    // CHARGEMENT IMAGE GRILLE
    // --------------------------------------------------------

    sourceImage =
        await imageFromPNGData(
            data.GRILLE
        );


    if (data.COULEUR)
    {
        colorImage =
            await imageFromPNGData(
                data.COULEUR
            );
    }


    if (data.PALETTE)
    {
        paletteImage =
            await imageFromPNGData(
                data.PALETTE
            );
    }


    // --------------------------------------------------------
    // DIMENSIONS
    // --------------------------------------------------------

    cols =
        Math.floor(
            sourceImage.naturalWidth / tileSize
        );

    rows =
        Math.floor(
            sourceImage.naturalHeight / tileSize
        );


    // --------------------------------------------------------
    // INDEX SELECTIONNES
    // --------------------------------------------------------

    selectedTiles =
        decodeNSIndexSet(
            data.ENCOURS
        );


    console.log(
        "selectedTiles.size =",
        selectedTiles.size
    );


    // --------------------------------------------------------
    // CONVENTION TILEORIGIN
    //
    // TILEORIGIN = 1 :
    // index directement utilisable.
    //
    // Ancien fichier :
    // index Mac avec origine bas-gauche.
    // --------------------------------------------------------

    if (data.TILEORIGIN !== 1)
    {
        const converted =
            new Set();

        for (const macIndex of selectedTiles)
        {
            const macRow =
                Math.floor(
                    macIndex / cols
                );

            const col =
                macIndex % cols;

            const ipadRow =
                rows - 1 - macRow;

            const ipadIndex =
                ipadRow * cols + col;

            if (
                ipadIndex >= 0 &&
                ipadIndex < cols * rows
            )
            {
                converted.add(
                    ipadIndex
                );
            }
        }

        selectedTiles =
            converted;
    }


    fitGridInWorkspace();

    updateInfo();

    draw();
}


// ============================================================
// IMAGE PNG A PARTIR DE UINT8ARRAY
// ============================================================

function imageFromPNGData(data)
{
    return new Promise(
        function (resolve, reject)
        {
            if (!(data instanceof Uint8Array))
            {
                reject(
                    new Error(
                        "Données PNG invalides."
                    )
                );

                return;
            }


            const blob =
                new Blob(
                    [data],
                    {
                        type:"image/png"
                    }
                );


            const url =
                URL.createObjectURL(blob);


            const image =
                new Image();


            image.onload =
                function ()
                {
                    URL.revokeObjectURL(url);

                    resolve(image);
                };


            image.onerror =
                function ()
                {
                    URL.revokeObjectURL(url);

                    reject(
                        new Error(
                            "Impossible de décoder le PNG."
                        )
                    );
                };


            image.src = url;
        }
    );
}


// ============================================================
// BINARY PLIST
// ============================================================

function decodeBinaryPlist(bytes)
{
    const decoder =
        new BinaryPlistDecoder(bytes);

    return decoder.decode();
}


// ============================================================
// DECODEUR BINARY PLIST
// ============================================================

class BinaryPlistDecoder
{
    constructor(bytes)
    {
        this.bytes = bytes;
        this.view = new DataView(
            bytes.buffer,
            bytes.byteOffset,
            bytes.byteLength
        );

        this.offsetIntSize = 0;
        this.objectRefSize = 0;
        this.numObjects = 0;
        this.topObject = 0;
        this.offsetTableOffset = 0;

        this.offsets = [];

        this.cache = new Map();
    }


    decode()
    {
        const bytes = this.bytes;

        if (bytes.length < 40)
        {
            throw new Error(
                "Binary plist trop court."
            );
        }


        const signature =
            new TextDecoder().decode(
                bytes.subarray(0, 8)
            );


        if (signature !== "bplist00")
        {
            throw new Error(
                "Signature bplist00 absente."
            );
        }


        const trailerOffset =
            bytes.length - 32;


        this.offsetIntSize =
            bytes[trailerOffset + 6];

        this.objectRefSize =
            bytes[trailerOffset + 7];


        this.numObjects =
            Number(
                readUIntBE(
                    bytes,
                    trailerOffset + 8,
                    8
                )
            );


        this.topObject =
            Number(
                readUIntBE(
                    bytes,
                    trailerOffset + 16,
                    8
                )
            );


        this.offsetTableOffset =
            Number(
                readUIntBE(
                    bytes,
                    trailerOffset + 24,
                    8
                )
            );


        console.log(
            "offsetIntSize:",
            this.offsetIntSize
        );

        console.log(
            "objectRefSize:",
            this.objectRefSize
        );

        console.log(
            "numObjects:",
            this.numObjects
        );

        console.log(
            "topObject:",
            this.topObject
        );

        console.log(
            "offsetTableOffset:",
            this.offsetTableOffset
        );


        for (
            let i = 0;
            i < this.numObjects;
            i++
        )
        {
            const offset =
                Number(
                    readUIntBE(
                        bytes,
                        this.offsetTableOffset +
                        i * this.offsetIntSize,
                        this.offsetIntSize
                    )
                );

            this.offsets.push(offset);
        }


        return this.decodeObject(
            this.topObject
        );
    }


    decodeObject(index)
    {
        if (this.cache.has(index))
        {
            return this.cache.get(index);
        }


        const offset =
            this.offsets[index];

        const marker =
            this.bytes[offset];


        const type =
            marker >> 4;

        const info =
            marker & 0x0f;


        let result;


        switch (type)
        {
            case 0x0:
                result =
                    this.decodeSimple(
                        info
                    );
                break;


            case 0x1:
                result =
                    this.decodeInteger(
                        info,
                        offset
                    );
                break;


            case 0x4:
                result =
                    this.decodeData(
                        info,
                        offset
                    );
                break;


            case 0x5:
                result =
                    this.decodeASCII(
                        info,
                        offset
                    );
                break;


            case 0x6:
                result =
                    this.decodeUTF16(
                        info,
                        offset
                    );
                break;


            case 0x8:
                result =
                    {
                        uid:
                            this.decodeUID(
                                info,
                                offset
                            )
                    };
                break;


            case 0xa:
                result =
                    this.decodeArray(
                        info,
                        offset
                    );
                break;


            case 0xd:
                result =
                    this.decodeDictionary(
                        info,
                        offset
                    );
                break;


            default:
                throw new Error(
                    "Type plist non supporté : 0x" +
                    type.toString(16)
                );
        }


        this.cache.set(
            index,
            result
        );


        return result;
    }


    decodeSimple(info)
    {
        if (info === 0x0)
            return null;

        if (info === 0x8)
            return false;

        if (info === 0x9)
            return true;

        throw new Error(
            "Objet simple plist non supporté."
        );
    }


    decodeInteger(info, offset)
    {
        const size =
            1 << info;

        return Number(
            readUIntBE(
                this.bytes,
                offset + 1,
                size
            )
        );
    }


    decodeData(info, offset)
    {
        const lengthInfo =
            this.decodeLength(
                info,
                offset
            );

        const start =
            lengthInfo.dataOffset;

        const length =
            lengthInfo.length;


        return this.bytes.slice(
            start,
            start + length
        );
    }


    decodeASCII(info, offset)
    {
        const lengthInfo =
            this.decodeLength(
                info,
                offset
            );

        const start =
            lengthInfo.dataOffset;

        const length =
            lengthInfo.length;


        return new TextDecoder(
            "ascii"
        ).decode(
            this.bytes.subarray(
                start,
                start + length
            )
        );
    }


    decodeUTF16(info, offset)
    {
        const lengthInfo =
            this.decodeLength(
                info,
                offset
            );

        const start =
            lengthInfo.dataOffset;

        const length =
            lengthInfo.length;


        let result = "";

        for (
            let i = 0;
            i < length;
            i++
        )
        {
            const code =
                this.view.getUint16(
                    start + i * 2,
                    false
                );

            result +=
                String.fromCharCode(code);
        }


        return result;
    }


    decodeUID(info, offset)
    {
        const length =
            info + 1;

        return Number(
            readUIntBE(
                this.bytes,
                offset + 1,
                length
            )
        );
    }


    decodeArray(info, offset)
    {
        const lengthInfo =
            this.decodeLength(
                info,
                offset
            );

        const count =
            lengthInfo.length;

        let cursor =
            lengthInfo.dataOffset;


        const result = [];


        for (
            let i = 0;
            i < count;
            i++
        )
        {
            const ref =
                Number(
                    readUIntBE(
                        this.bytes,
                        cursor,
                        this.objectRefSize
                    )
                );

            cursor +=
                this.objectRefSize;


            result.push(
                this.decodeObject(ref)
            );
        }


        return result;
    }


    decodeDictionary(info, offset)
    {
        const lengthInfo =
            this.decodeLength(
                info,
                offset
            );

        const count =
            lengthInfo.length;

        let cursor =
            lengthInfo.dataOffset;


        const keyRefs = [];

        const valueRefs = [];


        for (
            let i = 0;
            i < count;
            i++
        )
        {
            keyRefs.push(
                Number(
                    readUIntBE(
                        this.bytes,
                        cursor,
                        this.objectRefSize
                    )
                )
            );

            cursor +=
                this.objectRefSize;
        }


        for (
            let i = 0;
            i < count;
            i++
        )
        {
            valueRefs.push(
                Number(
                    readUIntBE(
                        this.bytes,
                        cursor,
                        this.objectRefSize
                    )
                )
            );

            cursor +=
                this.objectRefSize;
        }


        const result = {};

        for (
            let i = 0;
            i < count;
            i++
        )
        {
            result[
                this.decodeObject(
                    keyRefs[i]
                )
            ] =
                this.decodeObject(
                    valueRefs[i]
                );
        }


        return result;
    }


    decodeLength(info, offset)
    {
        if (info < 0x0f)
        {
            return {
                length: info,
                dataOffset: offset + 1
            };
        }


        const marker =
            this.bytes[offset + 1];

        const type =
            marker >> 4;

        const intInfo =
            marker & 0x0f;


        if (type !== 0x1)
        {
            throw new Error(
                "Longueur plist invalide."
            );
        }


        const size =
            1 << intInfo;


        const length =
            Number(
                readUIntBE(
                    this.bytes,
                    offset + 2,
                    size
                )
            );


        return {
            length: length,
            dataOffset: offset + 2 + size
        };
    }
}


// ============================================================
// NSKEYEDARCHIVER
// ============================================================

function decodeGrilleArchive(archive)
{
    if (!archive || !archive.$objects)
    {
        throw new Error(
            "Archive NSKeyedArchiver invalide."
        );
    }


    const resolver =
        new KeyedArchiveResolver(
            archive
        );


    const rootUID =
        archive.$top?.root?.uid;


    if (rootUID === undefined)
    {
        throw new Error(
            "Racine NSKeyedArchiver absente."
        );
    }


    return resolver.resolveObject(
        rootUID
    );
}


// ============================================================
// RESOLVEUR NSKEYEDARCHIVER
// ============================================================

class KeyedArchiveResolver
{
    constructor(archive)
    {
        this.objects =
            archive.$objects;

        this.cache =
            new Map();
    }


    resolveObject(value)
    {
        if (
            value &&
            typeof value === "object" &&
            Object.prototype.hasOwnProperty.call(
                value,
                "uid"
            )
        )
        {
            return this.resolveUID(
                value.uid
            );
        }


        return value;
    }


    resolveUID(uid)
    {
        if (this.cache.has(uid))
        {
            return this.cache.get(uid);
        }


        const object =
            this.objects[uid];


        if (object === null ||
            object === undefined)
        {
            return null;
        }


        // ----------------------------------------------------
        // Chaînes / nombres simples
        // ----------------------------------------------------

        if (
            typeof object !== "object" ||
            object instanceof Uint8Array ||
            Array.isArray(object)
        )
        {
            return object;
        }


        // ----------------------------------------------------
        // NSData
        // ----------------------------------------------------

        if (
            object["NS.data"] instanceof Uint8Array
        )
        {
            const result =
                object["NS.data"];

            this.cache.set(
                uid,
                result
            );

            return result;
        }


        // ----------------------------------------------------
        // NSDictionary
        // ----------------------------------------------------

        if (
            Array.isArray(object["NS.keys"]) &&
            Array.isArray(object["NS.objects"])
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


            this.cache.set(
                uid,
                dictionary
            );

            return dictionary;
        }


        // ----------------------------------------------------
        // NSIndexSet
        // ----------------------------------------------------

        if (
            object.NSRangeCount !== undefined &&
            object.NSRangeData !== undefined
        )
        {
            const rangeData =
                this.resolveObject(
                    object.NSRangeData
                );


            const result =
                {
                    type: "NSIndexSet",
                    count: object.NSRangeCount,
                    rangeData: rangeData
                };


            this.cache.set(
                uid,
                result
            );

            return result;
        }


        // ----------------------------------------------------
        // Objet générique
        // ----------------------------------------------------

        const result = {};

        for (
            const key of Object.keys(object)
        )
        {
            if (key === "$class")
                continue;

            result[key] =
                this.resolveObject(
                    object[key]
                );
        }


        this.cache.set(
            uid,
            result
        );


        return result;
    }
}


// ============================================================
// EXTRACTION GRILLE
// ============================================================

function extractGrilleData(root)
{
    return root;
}


// ============================================================
// NSIndexSet
// ============================================================

function decodeNSIndexSet(value)
{
    const result =
        new Set();


    if (!value)
        return result;


    if (Array.isArray(value))
    {
        for (const index of value)
        {
            if (Number.isInteger(index))
                result.add(index);
        }

        return result;
    }


    if (value.type !== "NSIndexSet")
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


    if (!(data instanceof Uint8Array))
    {
        console.warn(
            "NSRangeData absent."
        );

        return result;
    }


    function decodePackedUInt(
        bytes,
        offset
    )
    {
        let first =
            bytes[offset++];


        if (first < 128)
        {
            return {
                value: first,
                nextOffset: offset
            };
        }


        let value =
            first - 128;

        let multiplier = 128;


        while (
            offset < bytes.length
        )
        {
            const byte =
                bytes[offset++];


            if (byte < 128)
            {
                value +=
                    multiplier * byte;

                return {
                    value: value,
                    nextOffset: offset
                };
            }


            value +=
                multiplier *
                (byte - 128);

            multiplier *= 128;
        }


        throw new Error(
            "NSRangeData tronqué pendant le décodage PackedUIntSequence."
        );
    }


    const integers = [];

    let offset = 0;


    while (
        offset < data.length
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


    let decodedCount = 0;


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


        if (length <= 0)
            continue;


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


        decodedCount += length;
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
// UTILITAIRE UINT BIG-ENDIAN
// ============================================================

function readUIntBE(
    bytes,
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
            bytes[offset + i];
    }

    return value;
}


// ============================================================
// INFOS
// ============================================================

function updateInfo()
{
    const info =
        document.getElementById("info");

    if (!info)
        return;


    if (!sourceImage)
    {
        info.textContent =
            "Aucune image";

        return;
    }


    info.textContent =
        cols +
        " × " +
        rows +
        " — " +
        selectedTiles.size +
        " cases";
}


// ============================================================
// EFFACER SELECTION
// ============================================================

function clearSelection()
{
    selectedTiles.clear();

    updateInfo();

    draw();
}
