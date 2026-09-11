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
            "lzfse_malloc :",
            typeof module._lzfse_malloc
        );

        console.log(
            "lzfse_free :",
            typeof module._lzfse_free
        );

        console.log(
            "lzfse_copy_to_wasm :",
            typeof module._lzfse_copy_to_wasm
        );

        console.log(
            "lzfse_read_byte :",
            typeof module._lzfse_read_byte
        );

        console.log(
            "decode_lzfse_buffer :",
            typeof module._decode_lzfse_buffer
        );


        if (
            typeof module._lzfse_malloc !== "function" ||
            typeof module._lzfse_free !== "function" ||
            typeof module._lzfse_copy_to_wasm !== "function" ||
            typeof module._lzfse_read_byte !== "function" ||
            typeof module._decode_lzfse_buffer !== "function"
        )
        {
            throw new Error(
                "Une fonction LZFSE n'est pas disponible dans le module WASM."
            );
        }


        lzfseModule = module;

        console.log("LZFSE prêt");
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
// UTILITAIRE : distance entre deux touches
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
// UTILITAIRE : position dans le canvas
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
            Math.floor(index / cols);


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
// CASE À PARTIR D'UN POINT
// ============================================================

function tileIndexFromPoint(x, y)
{
    const col =
        Math.floor(x / tileSize);

    const row =
        Math.floor(y / tileSize);


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
        tileIndexFromPoint(x, y);


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
// LZFSE : COPIE JS -> WASM
// ============================================================

function copyBytesToWasm(bytes)
{
    if (!lzfseModule)
        throw new Error("LZFSE non initialisé");


    const ptr =
        lzfseModule._lzfse_malloc(
            bytes.length
        );


    if (!ptr)
    {
        throw new Error(
            "Impossible d'allouer la mémoire WASM."
        );
    }


    // On copie les données JavaScript
    // dans la mémoire WASM octet par octet
    //
    // La fonction C fait le vrai memcpy.
    //
    // Pour lui passer la source JavaScript,
    // on utilise temporairement FS n'est PAS possible
    // ici. Nous allons donc utiliser un buffer
    // Uint8Array partagé avec la mémoire WASM.
    //
    // Cette fonction est remplacée plus bas par
    // copyBytesToWasmDirect() si wasmMemory est disponible.


    return ptr;
}


// ============================================================
// ACCÈS MÉMOIRE WASM
// ============================================================

function getWasmMemory()
{
    /*
     * Les versions modernes d'Emscripten exposent
     * normalement la mémoire sous forme de WebAssembly.Memory.
     */

    if (
        lzfseModule &&
        lzfseModule.wasmMemory
    )
    {
        return lzfseModule.wasmMemory;
    }


    if (
        lzfseModule &&
        lzfseModule.asm &&
        lzfseModule.asm.memory
    )
    {
        return lzfseModule.asm.memory;
    }


    return null;
}


// ============================================================
// COPIE DIRECTE VERS WASM
// ============================================================

function copyBytesIntoWasm(ptr, bytes)
{
    const memory =
        getWasmMemory();


    if (!memory)
    {
        throw new Error(
            "La mémoire WASM n'est pas accessible."
        );
    }


    const heap =
        new Uint8Array(
            memory.buffer
        );


    heap.set(
        bytes,
        ptr
    );
}


// ============================================================
// LECTURE DEPUIS WASM
// ============================================================

function copyBytesFromWasm(ptr, size)
{
    const memory =
        getWasmMemory();


    if (!memory)
    {
        throw new Error(
            "La mémoire WASM n'est pas accessible."
        );
    }


    const heap =
        new Uint8Array(
            memory.buffer
        );


    const result =
        new Uint8Array(size);


    result.set(
        heap.subarray(
            ptr,
            ptr + size
        )
    );


    return result;
}


// ============================================================
// DÉCOMPRESSION LZFSE DIRECTE
// ============================================================

function decompressLZFSE(compressed,
                         originalSize)
{
    if (!lzfseModule)
    {
        throw new Error(
            "Le module LZFSE n'est pas prêt."
        );
    }


    console.log(
        "Décompression directe LZFSE..."
    );


    console.log(
        "Compressed :",
        compressed.length
    );

    console.log(
        "Expected :",
        originalSize
    );


    // --------------------------------------------------------
    // Allocation WASM
    // --------------------------------------------------------

    const compressedPtr =
        lzfseModule._lzfse_malloc(
            compressed.length
        );


    if (!compressedPtr)
    {
        throw new Error(
            "Allocation compressed impossible."
        );
    }


    const decodedPtr =
        lzfseModule._lzfse_malloc(
            originalSize
        );


    if (!decodedPtr)
    {
        lzfseModule._lzfse_free(
            compressedPtr
        );

        throw new Error(
            "Allocation decoded impossible."
        );
    }


    try
    {
        // ----------------------------------------------------
        // JS -> WASM
        // ----------------------------------------------------

        copyBytesIntoWasm(
            compressedPtr,
            compressed
        );


        // ----------------------------------------------------
        // LZFSE
        // ----------------------------------------------------

        const decodedSize =
            lzfseModule._decode_lzfse_buffer(
                compressedPtr,
                compressed.length,
                decodedPtr,
                originalSize
            );


        console.log(
            "Taille décompressée :",
            decodedSize
        );


        if (!decodedSize)
        {
            throw new Error(
                "Échec de la décompression LZFSE."
            );
        }


        // ----------------------------------------------------
        // WASM -> JS
        // ----------------------------------------------------

        const decoded =
            copyBytesFromWasm(
                decodedPtr,
                decodedSize
            );


        console.log(
            "Archive décompressée :",
            decoded.length,
            "octets"
        );


        return decoded;
    }
    finally
    {
        lzfseModule._lzfse_free(
            compressedPtr
        );

        lzfseModule._lzfse_free(
            decodedPtr
        );
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
    // Lecture du fichier
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
    // Les 8 premiers octets sont un uint64 little endian.
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
        bytes.subarray(8);


    console.log(
        "Taille LZFSE :",
        compressed.length
    );


    // --------------------------------------------------------
    // Vérification signature
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
        decompressLZFSE(
            compressed,
            originalSize
        );


    // --------------------------------------------------------
    // Vérification
    // --------------------------------------------------------

    if (
        decoded.length !==
        originalSize
    )
    {
        console.warn(
            "Taille obtenue différente de la taille annoncée :",
            decoded.length,
            originalSize
        );
    }


    console.log(
        "Décompression terminée."
    );


    // Pour l'instant on conserve les données
    // afin de préparer le décodage NSKeyedArchiver.
    window.lastDecodedGrille =
        decoded;


    console.log(
        "window.lastDecodedGrille disponible :",
        decoded.length,
        "octets"
    );


    // --------------------------------------------------------
    // Analyse rapide des premiers octets
    // --------------------------------------------------------

    console.log(
        "Premiers octets de l'archive :",
        Array.from(
            decoded.subarray(
                0,
                Math.min(32, decoded.length)
            )
        )
    );


    // --------------------------------------------------------
    // Pour l'instant
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
        canvas.getContext("2d");


    if (!ctx)
    {
        console.error(
            "Impossible de créer le contexte 2D."
        );

        return;
    }


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
    // Ouvrir image
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
                    loadImageFile(file);
                }
            }
        );
    }


    // --------------------------------------------------------
    // Ouvrir grille
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
    // Effacer
    // --------------------------------------------------------

    if (clearButton)
    {
        clearButton.addEventListener(
            "click",
            clearAll
        );
    }


    // --------------------------------------------------------
    // Taille des cases
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
    // Touch
    // --------------------------------------------------------

    canvas.addEventListener(
        "touchstart",
        event =>
        {
            event.preventDefault();


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
                        zoomFactor * ratio
                    );
                }


                lastTouchDistance =
                    distance;


                return;
            }


            // ------------------------------------------------
            // Un doigt = sélection
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
    // Initialisation
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
