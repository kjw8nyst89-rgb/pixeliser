import createLZFSEModule from "./lzfse/lzfse.js";
const version="V7-3";
// ============================================================
// VARIABLES GLOBALES
// ============================================================
let sourceImagePNGBytes=null;
let colorImagePNGBytes=null;
let paletteImagePNGBytes=null;
let shareInProgress=false;
let currentGrilleFileName="grille.grille";
let lzfseModule=null;
let sourceImage=null;
let colorImage=null;
let paletteImage=null;
let canvas=null;
let ctx=null;
let cols=0;
let rows=0;
let tileSize=20;
let selectedTiles=new Set();
// ============================================================
// CAMERA
// ============================================================
let zoomFactor=1.0;
let panX=0;
let panY=0;
// ============================================================
// POINTER / TOUCH
// ============================================================
let activePointers=new Map();
let singlePointer=null;
let singlePointerMoved=false;
let lastPointerWorldX=0;
let lastPointerWorldY=0;
// ============================================================
// PINCH
// ============================================================
let lastPinchDistance=0;
let lastPinchCenterX=0;
let lastPinchCenterY=0;
let touchInteractionActive=false;
// ============================================================
// INITIALISATION
// ============================================================
document.addEventListener("DOMContentLoaded",async function(){
    console.log("Pixeliser démarrage...");
    console.log("Version ",version);
    canvas=document.getElementById("canvas");
    if(!canvas){
        console.error("Canvas introuvable.");
        return;
    }
    ctx=canvas.getContext("2d");
    if(!ctx){
        console.error("Impossible de créer le contexte 2D.");
        return;
    }
    const openGrilleButton=document.getElementById("openGrilleButton");
    const clearButton=document.getElementById("clearButton");
    const grilleInput=document.getElementById("grilleInput");
    const saveGrilleButton=document.getElementById("saveGrilleButton");
    if(saveGrilleButton){
        saveGrilleButton.addEventListener("click",saveGrilleFile);
    }
    if(openGrilleButton){
        openGrilleButton.addEventListener("click",function(){
            grilleInput.click();
        });
    }
    if(grilleInput){
        grilleInput.addEventListener("change",async function(event){
            const file=event.target.files[0];
            if(!file){
                return;
            }
            try{
                await loadGrilleFile(file);
            }
            catch(error){
                console.error("Erreur lecture grille :",error);
                alert("Erreur lecture grille :\n"+error.message);
            }
        });
    }
    if(clearButton){
        clearButton.addEventListener("click",clearSelection);
    }
    canvas.addEventListener("pointerdown",handlePointerDown,{passive:false});
    canvas.addEventListener("pointermove",handlePointerMove,{passive:false});
    canvas.addEventListener("pointerup",handlePointerUp,{passive:false});
    canvas.addEventListener("pointercancel",handlePointerUp,{passive:false});
    canvas.addEventListener("touchstart",handleTouchStart,{passive:false});
    canvas.addEventListener("touchmove",handleTouchMove,{passive:false});
    canvas.addEventListener("touchend",handleTouchEnd,{passive:false});
    canvas.addEventListener("touchcancel",handleTouchEnd,{passive:false});
    canvas.addEventListener("wheel",handleWheel,{passive:false});
    window.addEventListener("resize",function(){
        resizeCanvasToWorkspace();
        draw();
    });
    try{
        await initializeLZFSE();
    }
    catch(error){
        console.error("LZFSE indisponible :",error);
    }
});
// ============================================================
// LZFSE
// ============================================================
async function initializeLZFSE(){
    console.log("Chargement du module LZFSE...");
    try{
        const module=await createLZFSEModule();
        console.log("Module LZFSE créé :",module);
        if(typeof module._decode_lzfse_memfs!=="function"){
            throw new Error("_decode_lzfse_memfs n'est pas disponible.");
        }
        if(typeof module._encode_lzfse_memfs!=="function"){
            throw new Error("_encode_lzfse_memfs n'est pas disponible.");
        }
        if(!module.FS){
            throw new Error("Le système de fichiers MEMFS n'est pas disponible.");
        }
        lzfseModule=module;
        console.log("decode_lzfse_memfs :",typeof lzfseModule._decode_lzfse_memfs);
        console.log("encode_lzfse_memfs :",typeof lzfseModule._encode_lzfse_memfs);
        console.log("LZFSE prêt");
        await testEncodeLZFSE();
    }
    catch(error){
        console.error("ERREUR INITIALISATION LZFSE :",error);
        throw error;
    }
}
// ============================================================
// ENCODAGE LZFSE
// ============================================================
function encodeLZFSE(data){
    if(!lzfseModule){
        throw new Error("Le module LZFSE n'est pas prêt.");
    }
    if(typeof lzfseModule._encode_lzfse_memfs!=="function"){
        throw new Error("_encode_lzfse_memfs n'est pas disponible.");
    }
    if(!lzfseModule.FS){
        throw new Error("Le système de fichiers MEMFS n'est pas disponible.");
    }
    const inputPath="/grille_input.bin";
    const outputPath="/grille_output.lzfse";
    try{
        lzfseModule.FS.unlink(inputPath);
    }
    catch(e){}
    try{
        lzfseModule.FS.unlink(outputPath);
    }
    catch(e){}
    console.log("Copie des données dans MEMFS...");
    lzfseModule.FS.writeFile(inputPath,data);
    console.log("Fichier MEMFS créé :",inputPath);
    console.log("Appel encode_lzfse_memfs...");
    const encodedSize=lzfseModule._encode_lzfse_memfs(data.length);
    console.log("Taille compressée retournée :",encodedSize);
    if(encodedSize<=0){
        throw new Error("Échec de l'encodage LZFSE : "+encodedSize);
    }
    const compressed=lzfseModule.FS.readFile(outputPath);
    console.log("Archive LZFSE :",compressed.length,"octets");
    try{
        lzfseModule.FS.unlink(inputPath);
    }
    catch(e){}
    try{
        lzfseModule.FS.unlink(outputPath);
    }
    catch(e){}
    return new Uint8Array(compressed);
}
// ============================================================
// TEST ENCODAGE LZFSE
// ============================================================
async function testEncodeLZFSE(){
    const testData=new TextEncoder().encode("TEST LZFSE depuis Safari iPad");
    console.log("=== TEST ENCODAGE LZFSE ===");
    const compressed=encodeLZFSE(testData);
    console.log("Entrée :",testData.length,"octets");
    console.log("Sortie :",compressed.length,"octets");
    console.log("Signature :",String.fromCharCode(compressed[0],compressed[1],compressed[2],compressed[3]));
}
// ============================================================
// DÉCOMPRESSION LZFSE
// ============================================================
async function decompressLZFSE(compressed,originalSize){
    if(!lzfseModule){
        throw new Error("Le module LZFSE n'est pas prêt.");
    }
    console.log("Décompression LZFSE via MEMFS...");
    console.log("Compressed :",compressed.length);
    console.log("Expected :",originalSize);
    const inputPath="/grille_input.lzfse";
    const outputPath="/grille_output.bin";
    try{
        lzfseModule.FS.unlink(inputPath);
    }
    catch(e){}
    try{
        lzfseModule.FS.unlink(outputPath);
    }
    catch(e){}
    console.log("Copie des données LZFSE dans MEMFS...");
    lzfseModule.FS.writeFile(inputPath,compressed);
    console.log("Fichier MEMFS créé :",inputPath);
    console.log("Appel decode_lzfse_memfs...");
    const decodedSize=lzfseModule._decode_lzfse_memfs(originalSize);
    console.log("Taille décompressée :",decodedSize);
    if(decodedSize<=0){
        throw new Error("Échec de la décompression LZFSE.");
    }
    const decoded=lzfseModule.FS.readFile(outputPath);
    console.log("Archive décompressée :",decoded.length,"octets");
    try{
        lzfseModule.FS.unlink(inputPath);
    }
    catch(e){}
    try{
        lzfseModule.FS.unlink(outputPath);
    }
    catch(e){}
    return new Uint8Array(decoded);
}
// ============================================================
// BINARY PLIST
// ============================================================
class BinaryPlistDecoder{
    constructor(bytes){
        this.bytes=bytes;
        this.objects=[];
        this.offsets=[];
        this.objectRefSize=0;
        this.offsetIntSize=0;
        this.numObjects=0;
        this.topObject=0;
        this.offsetTableOffset=0;
    }
    readUIntBE(offset,size){
        let value=0;
        for(let i=0;i<size;i++){
            value=value*256+this.bytes[offset+i];
        }
        return value;
    }
    readDoubleBE(offset){
        const buffer=this.bytes.buffer.slice(this.bytes.byteOffset+offset,this.bytes.byteOffset+offset+8);
        return new DataView(buffer).getFloat64(0,false);
    }
    decode(){
        if(this.bytes.length<40){
            throw new Error("Binary plist trop court.");
        }
        const magic=String.fromCharCode(this.bytes[0],this.bytes[1],this.bytes[2],this.bytes[3],this.bytes[4],this.bytes[5],this.bytes[6],this.bytes[7]);
        if(magic!=="bplist00"){
            throw new Error("Ce fichier n'est pas un binary plist.");
        }
        const trailer=this.bytes.length-32;
        this.offsetIntSize=this.bytes[trailer+6];
        this.objectRefSize=this.bytes[trailer+7];
        this.numObjects=this.readUIntBE(trailer+8,8);
        this.topObject=this.readUIntBE(trailer+16,8);
        this.offsetTableOffset=this.readUIntBE(trailer+24,8);
        console.log("Binary plist :",{offsetIntSize:this.offsetIntSize,objectRefSize:this.objectRefSize,numObjects:this.numObjects,topObject:this.topObject,offsetTableOffset:this.offsetTableOffset});
        this.offsets=new Array(this.numObjects);
        for(let i=0;i<this.numObjects;i++){
            this.offsets[i]=this.readUIntBE(this.offsetTableOffset+i*this.offsetIntSize,this.offsetIntSize);
        }
        this.objects=new Array(this.numObjects);
        return this.decodeObject(this.topObject);
    }
    decodeObject(ref){
        if(ref<0||ref>=this.numObjects){
            throw new Error("Référence objet invalide : "+ref);
        }
        if(this.objects[ref]!==undefined){
            return this.objects[ref];
        }
        const offset=this.offsets[ref];
        const marker=this.bytes[offset];
        const type=marker>>4;
        const info=marker&0x0F;
        let value;
        switch(type){
            case 0x0:
                value=this.decodeSimple(info);
                break;
            case 0x1:
                value=this.decodeInteger(info,offset);
                break;
            case 0x2:
                value=this.decodeReal(info,offset);
                break;
            case 0x3:
                value=this.decodeDate(info,offset);
                break;
            case 0x4:
                value=this.decodeData(info,offset);
                break;
            case 0x5:
                value=this.decodeASCII(info,offset);
                break;
            case 0x6:
                value=this.decodeUTF16(info,offset);
                break;
            case 0x8:
                value=this.decodeUID(info,offset);
                break;
            case 0xA:
                value=this.decodeArray(info,offset);
                break;
            case 0xD:
                value=this.decodeDictionary(info,offset);
                break;
            default:
                throw new Error("Type plist inconnu : 0x"+type.toString(16));
        }
        this.objects[ref]=value;
        return value;
    }
    decodeLength(info,offset){
        if(info<0x0F){
            return{length:info,offset:offset+1};
        }
        const marker=this.bytes[offset+1];
        const type=marker>>4;
        const integerInfo=marker&0x0F;
        if(type!==0x1){
            throw new Error("Longueur plist invalide.");
        }
        const byteCount=1<<integerInfo;
        const length=this.readUIntBE(offset+2,byteCount);
        return{length:length,offset:offset+2+byteCount};
    }
    decodeSimple(info){
        switch(info){
            case 0x0:
                return null;
            case 0x8:
                return false;
            case 0x9:
                return true;
            default:
                return{plistSimple:info};
        }
    }
    decodeInteger(info,offset){
        const byteCount=1<<info;
        return this.readUIntBE(offset+1,byteCount);
    }
    decodeReal(info,offset){
        const byteCount=1<<info;
        if(byteCount===4){
            const buffer=this.bytes.buffer.slice(this.bytes.byteOffset+offset+1,this.bytes.byteOffset+offset+5);
            return new DataView(buffer).getFloat32(0,false);
        }
        if(byteCount===8){
            return this.readDoubleBE(offset+1);
        }
        throw new Error("REAL plist non supporté.");
    }
    decodeDate(info,offset){
        if(info!==0x3){
            throw new Error("DATE plist invalide.");
        }
        return this.readDoubleBE(offset+1);
    }
    decodeData(info,offset){
        const result=this.decodeLength(info,offset);
        return this.bytes.slice(result.offset,result.offset+result.length);
    }
    decodeASCII(info,offset){
        const result=this.decodeLength(info,offset);
        let text="";
        for(let i=0;i<result.length;i++){
            text+=String.fromCharCode(this.bytes[result.offset+i]);
        }
        return text;
    }
    decodeUTF16(info,offset){
        const result=this.decodeLength(info,offset);
        let text="";
        for(let i=0;i<result.length;i++){
            const p=result.offset+i*2;
            const code=(this.bytes[p]<<8)|this.bytes[p+1];
            text+=String.fromCharCode(code);
        }
        return text;
    }
    decodeUID(info,offset){
        const length=info+1;
        let value=0;
        for(let i=0;i<length;i++){
            value=value*256+this.bytes[offset+1+i];
        }
        return{uid:value};
    }
    decodeArray(info,offset){
        const result=this.decodeLength(info,offset);
        let pos=result.offset;
        const array=new Array(result.length);
        for(let i=0;i<result.length;i++){
            const ref=this.readUIntBE(pos,this.objectRefSize);
            pos+=this.objectRefSize;
            array[i]=this.decodeObject(ref);
        }
        return array;
    }
    decodeDictionary(info,offset){
        const result=this.decodeLength(info,offset);
        const count=result.length;
        let pos=result.offset;
        const keyRefs=new Array(count);
        const valueRefs=new Array(count);
        for(let i=0;i<count;i++){
            keyRefs[i]=this.readUIntBE(pos,this.objectRefSize);
            pos+=this.objectRefSize;
        }
        for(let i=0;i<count;i++){
            valueRefs[i]=this.readUIntBE(pos,this.objectRefSize);
            pos+=this.objectRefSize;
        }
        const dictionary={};
        for(let i=0;i<count;i++){
            const key=this.decodeObject(keyRefs[i]);
            const value=this.decodeObject(valueRefs[i]);
            dictionary[key]=value;
        }
        return dictionary;
    }
}
// ============================================================
// NSKEYEDARCHIVER
// ============================================================
function isUID(value){
    return value&&typeof value==="object"&&Object.prototype.hasOwnProperty.call(value,"uid");
}
class KeyedArchiveResolver{
    constructor(plist){
        this.plist=plist;
        this.objects=plist["$objects"];
        if(!Array.isArray(this.objects)){
            throw new Error("$objects absent ou invalide.");
        }
        this.cache=new Map();
        this.resolving=new Set();
    }
    resolveUID(uidObject){
        if(!isUID(uidObject)){
            return uidObject;
        }
        return this.resolveIndex(uidObject.uid);
    }
    resolveIndex(index){
        if(index<0||index>=this.objects.length){
            throw new Error("UID hors limites : "+index);
        }
        if(this.cache.has(index)){
            return this.cache.get(index);
        }
        if(this.resolving.has(index)){
            return{"$circularUID":index};
        }
        const object=this.objects[index];
        if(object==="$null"||object===null){
            this.cache.set(index,null);
            return null;
        }
        this.resolving.add(index);
        let result;
        try{
            result=this.resolveObject(object);
        }
        finally{
            this.resolving.delete(index);
        }
        this.cache.set(index,result);
        return result;
    }
    resolveObject(object){
        if(isUID(object)){
            return this.resolveIndex(object.uid);
        }
        if(Array.isArray(object)){
            return object.map(value=>this.resolveObject(value));
        }
        if(object===null||typeof object!=="object"){
            return object;
        }
        if(object["NS.data"] instanceof Uint8Array){
            return object["NS.data"];
        }
        if(object["NSRangeCount"]!==undefined&&object["NSRangeData"]!==undefined){
            return{type:"NSIndexSet",count:object["NSRangeCount"],rangeData:this.resolveObject(object["NSRangeData"])};
        }
        if(Array.isArray(object["NS.keys"])&&Array.isArray(object["NS.objects"])){
            const dictionary={};
            const keys=object["NS.keys"];
            const values=object["NS.objects"];
            for(let i=0;i<keys.length;i++){
                const key=this.resolveObject(keys[i]);
                const value=this.resolveObject(values[i]);
                dictionary[key]=value;
            }
            return dictionary;
        }
        const result={};
        for(const key of Object.keys(object)){
            if(key==="$class"){
                continue;
            }
            result[key]=this.resolveObject(object[key]);
        }
        return result;
    }
    root(){
        const top=this.plist["$top"];
        if(!top){
            throw new Error("$top absent.");
        }
        const rootUID=top["root"];
        if(!rootUID){
            throw new Error("root absent dans $top.");
        }
        console.log("UID racine :",rootUID.uid);
        return this.resolveUID(rootUID);
    }
}
// ============================================================
// DECODAGE ARCHIVE
// ============================================================
function decodeGrilleArchive(decoded){
    console.log("================================");
    console.log("DECODAGE BINARY PLIST");
    console.log("Taille :",decoded.length);
    const decoder=new BinaryPlistDecoder(decoded);
    const plist=decoder.decode();
    window.lastPlist=plist;
    window.lastPlistDecoder=decoder;
    console.log("Plist décodé :",plist);
    console.log("Clés plist racine :",Object.keys(plist));
    if(plist["$archiver"]!=="NSKeyedArchiver"){
        throw new Error("Archive NSKeyedArchiver attendue.");
    }
    const resolver=new KeyedArchiveResolver(plist);
    window.lastArchiveResolver=resolver;
    const root=resolver.root();
    window.lastArchiveRoot=root;
    console.log("OBJET RACINE NSKEYEDARCHIVER :",root);
    return root;
}
// ============================================================
// EXTRACTION DES DONNÉES DE LA GRILLE
// ============================================================
function extractGrilleData(root){
    console.log("================================");
    console.log("EXTRACTION DONNÉES GRILLE");
    if(!root||typeof root!=="object"){
        throw new Error("Objet racine NSKeyedArchiver invalide.");
    }
    console.log("Type root :",typeof root);
    console.log("Clés root :",Object.keys(root));
    const result=root;
    const expectedKeys=["GRILLE","COULEUR","PALETTE","ENCOURS","TILESIZE","TILEORIGIN"];
    for(const key of expectedKeys){
        if(Object.prototype.hasOwnProperty.call(result,key)){
            console.log(key+" :",result[key]);
        }
        else{
            console.warn("Clé absente :",key);
        }
    }
    console.log("================================");
    return result;
}
// ============================================================
// OUVERTURE .GRILLE
// ============================================================
async function loadGrilleFile(file){
    console.log("===============================");
    console.log("OUVERTURE GRILLE");
    console.log("Nom :",file.name);
    console.log("Taille fichier :",file.size);
    console.log("Type :",file.type);
    console.log("===============================");
    if(!lzfseModule){
        throw new Error("Le module LZFSE n'est pas prêt.");
    }
    const buffer=await file.arrayBuffer();
    const bytes=new Uint8Array(buffer);
    console.log("Buffer reçu :",bytes.length,"octets");
    if(bytes.length<8){
        throw new Error("Fichier .grille trop court.");
    }
    const view=new DataView(buffer);
    const originalSizeBig=view.getBigUint64(0,true);
    const originalSize=Number(originalSizeBig);
    console.log("Taille originale annoncée :",originalSize);
    if(!Number.isSafeInteger(originalSize)||originalSize<=0){
        throw new Error("Taille originale invalide.");
    }
    const compressed=bytes.subarray(8);
    console.log("Taille LZFSE :",compressed.length);
    if(compressed.length>=4){
        const signature=String.fromCharCode(compressed[0],compressed[1],compressed[2],compressed[3]);
        console.log("Signature LZFSE :",signature);
        if(signature!=="bvx2"){
            console.warn("Signature LZFSE inattendue :",signature);
        }
    }
    const decoded=await decompressLZFSE(compressed,originalSize);
    console.log("Décompression terminée :",decoded.length,"octets");
    window.lastDecodedGrille=decoded;
    const root=decodeGrilleArchive(decoded);
    const grilleData=extractGrilleData(root);
    if(!(grilleData.GRILLE instanceof Uint8Array)){
        throw new Error("Données GRILLE invalides.");
    }
    if(!(grilleData.COULEUR instanceof Uint8Array)){
        throw new Error("Données COULEUR invalides.");
    }
    if(!(grilleData.PALETTE instanceof Uint8Array)){
        throw new Error("Données PALETTE invalides.");
    }
    sourceImagePNGBytes=new Uint8Array(grilleData.GRILLE);
    colorImagePNGBytes=new Uint8Array(grilleData.COULEUR);
    paletteImagePNGBytes=new Uint8Array(grilleData.PALETTE);
    currentGrilleFileName=file.name;
    window.lastGrilleArchive=grilleData;
    console.log("================================");
    console.log("ARCHIVE GRILLE");
    console.log("GRILLE :",grilleData.GRILLE);
    console.log("COULEUR :",grilleData.COULEUR);
    console.log("PALETTE :",grilleData.PALETTE);
    console.log("ENCOURS :",grilleData.ENCOURS);
    console.log("TILESIZE :",grilleData.TILESIZE);
    console.log("TILEORIGIN :",grilleData.TILEORIGIN);
    console.log("================================");
    if(grilleData.GRILLE instanceof Uint8Array){
        sourceImage=await imageFromBytes(grilleData.GRILLE);
    }
    if(grilleData.COULEUR instanceof Uint8Array){
        colorImage=await imageFromBytes(grilleData.COULEUR);
    }
    if(grilleData.PALETTE instanceof Uint8Array){
        paletteImage=await imageFromBytes(grilleData.PALETTE);
    }
    if(typeof grilleData.TILESIZE==="number"){
        tileSize=Math.max(2,grilleData.TILESIZE*2);
    }
    selectedTiles=decodeNSIndexSet(grilleData.ENCOURS);
    console.log("Cases sélectionnées :",selectedTiles.size);
    recomputeGrid();
    resetCamera();
    draw();
    const info=document.getElementById("info");
    if(info){
        info.textContent=sourceImage?sourceImage.width+" × "+sourceImage.height+" — "+cols+" × "+rows:"Grille chargée";
    }
    console.log("GRILLE CHARGÉE");
    console.log("================================");
}
// ============================================================
// NSData -> IMAGE
// ============================================================
function imageFromBytes(bytes){
    return new Promise((resolve,reject)=>{
        console.log("imageFromBytes : début, taille =",bytes?bytes.length:null);
        if(!(bytes instanceof Uint8Array)){
            console.error("imageFromBytes : ce n'est pas un Uint8Array",bytes);
            reject(new Error("Données image invalides"));
            return;
        }
        const blob=new Blob([bytes],{type:"image/png"});
        console.log("imageFromBytes : Blob créé",blob.size,blob.type);
        const url=URL.createObjectURL(blob);
        console.log("imageFromBytes : URL",url);
        const img=new Image();
        img.onload=()=>{
            console.log("imageFromBytes : IMAGE CHARGÉE",img.width,"x",img.height);
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror=event=>{
            console.error("imageFromBytes : ERREUR CHARGEMENT IMAGE",event);
            URL.revokeObjectURL(url);
            reject(new Error("Impossible de décoder le PNG"));
        };
        img.src=url;
    });
}
// ============================================================
// NSINDEXSET
// ============================================================
function decodeNSIndexSet(value){
    const result=new Set();
    if(!value){
        return result;
    }
    if(Array.isArray(value)){
        for(const index of value){
            if(Number.isInteger(index)){
                result.add(index);
            }
        }
        return result;
    }
    if(value.type!=="NSIndexSet"){
        console.warn("Objet NSIndexSet inattendu :",value);
        return result;
    }
    console.log("NSIndexSet nombre de plages :",value.count);
    const data=value.rangeData;
    if(!(data instanceof Uint8Array)){
        console.warn("NSRangeData absent.");
        return result;
    }
    console.log("NSRangeData taille :",data.length);
    function decodePackedUInt(bytes,offset){
        let first=bytes[offset++];
        if(first<128){
            return{value:first,nextOffset:offset};
        }
        let value=first-128;
        let multiplier=128;
        while(offset<bytes.length){
            const byte=bytes[offset++];
            if(byte<128){
                value+=multiplier*byte;
                return{value:value,nextOffset:offset};
            }
            value+=multiplier*(byte-128);
            multiplier*=128;
        }
        throw new Error("NSRangeData tronqué pendant le décodage PackedUIntSequence.");
    }
    const integers=[];
    let offset=0;
    while(offset<data.length){
        const decoded=decodePackedUInt(data,offset);
        integers.push(decoded.value);
        offset=decoded.nextOffset;
    }
    console.log("PackedUIntSequence :",integers.length,"entiers");
    const expectedIntegerCount=value.count*2;
    if(integers.length!==expectedIntegerCount){
        console.warn("Nombre d'entiers inattendu :",integers.length,"attendu :",expectedIntegerCount);
    }
    let decodedCount=0;
    for(let i=0;i+1<integers.length;i+=2){
        const location=integers[i];
        const length=integers[i+1];
        console.log("NSIndexSet range :",location,"+",length);
        if(length<=0){
            continue;
        }
        for(let j=0;j<length;j++){
            result.add(location+j);
        }
        decodedCount+=length;
    }
    console.log("NSIndexSet cases réellement sélectionnées :",decodedCount);
    console.log("Set final :",result.size);
    return result;
}
// ============================================================
// IMAGE SIMPLE
// ============================================================
async function loadImageFile(file){
    console.log("Chargement image :",file.name);
    const url=URL.createObjectURL(file);
    const image=new Image();
    image.onload=function(){
        URL.revokeObjectURL(url);
        sourceImage=image;
        colorImage=null;
        paletteImage=null;
        sourceImagePNGBytes=null;
        colorImagePNGBytes=null;
        paletteImagePNGBytes=null;
        selectedTiles=new Set();
        recomputeGrid();
        resetCamera();
        draw();
        const info=document.getElementById("info");
        if(info){
            info.textContent=image.width+" × "+image.height+" — "+cols+" × "+rows;
        }
        console.log("Image chargée :",image.width,"x",image.height);
    };
    image.onerror=function(){
        URL.revokeObjectURL(url);
        alert("Impossible de charger l'image.");
    };
    image.src=url;
}
// ============================================================
// GRILLE
// ============================================================
function recomputeGrid(){
    if(!sourceImage){
        cols=0;
        rows=0;
        canvas.width=1;
        canvas.height=1;
        return;
    }
    cols=Math.ceil(sourceImage.width/tileSize);
    rows=Math.ceil(sourceImage.height/tileSize);
    resizeCanvasToWorkspace();
    console.log("Grille :",cols,"x",rows,"cases");
}
// ============================================================
// RESIZE CANVAS
// ============================================================
function resizeCanvasToWorkspace(){
    if(!canvas){
        return;
    }
    const workspace=document.getElementById("workspace");
    if(!workspace){
        return;
    }
    const rect=workspace.getBoundingClientRect();
    const width=Math.max(1,Math.round(rect.width));
    const height=Math.max(1,Math.round(rect.height));
    const dpr=Math.max(1,window.devicePixelRatio||1);
    canvas.width=Math.round(width*dpr);
    canvas.height=Math.round(height*dpr);
    canvas.style.width=width+"px";
    canvas.style.height=height+"px";
}
// ============================================================
// CAMERA
// ============================================================
function getViewportSize(){
    if(!canvas){
        return{width:1,height:1};
    }
    const rect=canvas.getBoundingClientRect();
    return{width:rect.width,height:rect.height};
}
function resetCamera(){
    if(!sourceImage){
        zoomFactor=1.0;
        panX=0;
        panY=0;
        return;
    }
    const viewport=getViewportSize();
    const worldWidth=cols*tileSize;
    const worldHeight=rows*tileSize;
    if(worldWidth<=0||worldHeight<=0){
        zoomFactor=1.0;
        panX=0;
        panY=0;
        return;
    }
    const scaleX=viewport.width/worldWidth;
    const scaleY=viewport.height/worldHeight;
    zoomFactor=Math.min(scaleX,scaleY);
    zoomFactor=Math.max(0.05,Math.min(10.0,zoomFactor));
    panX=(viewport.width-worldWidth*zoomFactor)/2;
    panY=(viewport.height-worldHeight*zoomFactor)/2;
    console.log("Camera reset :",{zoom:zoomFactor,panX:panX,panY:panY});
}
// ============================================================
// POINT ÉCRAN -> MONDE
// ============================================================
function canvasPointFromClient(clientX,clientY){
    const rect=canvas.getBoundingClientRect();
    const screenX=clientX-rect.left;
    const screenY=clientY-rect.top;
    return{x:(screenX-panX)/zoomFactor,y:(screenY-panY)/zoomFactor};
}
// ============================================================
// DESSIN
// ============================================================
function draw(){
    if(!canvas||!ctx){
        return;
    }
    const rect=canvas.getBoundingClientRect();
    const viewportWidth=rect.width;
    const viewportHeight=rect.height;
    const dpr=Math.max(1,window.devicePixelRatio||1);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,viewportWidth,viewportHeight);
    if(!sourceImage){
        return;
    }
    ctx.save();
    ctx.translate(panX,panY);
    ctx.scale(zoomFactor,zoomFactor);
    const worldWidth=cols*tileSize;
    const worldHeight=rows*tileSize;
    ctx.drawImage(sourceImage,0,0,worldWidth,worldHeight);
    if(selectedTiles){
        for(const index of selectedTiles){
            if(index<0||index>=cols*rows){
                continue;
            }
            const col=index%cols;
            const row=Math.floor(index/cols);
            const x=col*tileSize;
            const y=row*tileSize;
            if(colorImage){
                const sx=x*colorImage.width/worldWidth;
                const sy=y*colorImage.height/worldHeight;
                const sw=tileSize*colorImage.width/worldWidth;
                const sh=tileSize*colorImage.height/worldHeight;
                ctx.drawImage(colorImage,sx,sy,sw,sh,x,y,tileSize,tileSize);
            }
            else{
                ctx.fillStyle="rgba(255, 0, 0, 0.35)";
                ctx.fillRect(x,y,tileSize,tileSize);
            }
        }
    }
    ctx.save();
    ctx.strokeStyle="rgba(0, 0, 0, 0.35)";
    ctx.lineWidth=1/zoomFactor;
    ctx.beginPath();
    for(let col=0;col<=cols;col++){
        const x=col*tileSize+0.5;
        ctx.moveTo(x,0);
        ctx.lineTo(x,worldHeight);
    }
    for(let row=0;row<=rows;row++){
        const y=row*tileSize+0.5;
        ctx.moveTo(0,y);
        ctx.lineTo(worldWidth,y);
    }
    ctx.stroke();
    ctx.restore();
    ctx.restore();
}
// ============================================================
// SELECTION
// ============================================================
function tileIndexForPoint(x,y){
    const col=Math.floor(x/tileSize);
    const row=Math.floor(y/tileSize);
    if(col<0||col>=cols||row<0||row>=rows){
        return -1;
    }
    return row*cols+col;
}
// ============================================================
// TOGGLE
// ============================================================
function toggleTileAt(x,y){
    const index=tileIndexForPoint(x,y);
    if(index<0){
        return;
    }
    if(selectedTiles.has(index)){
        selectedTiles.delete(index);
    }
    else{
        selectedTiles.add(index);
    }
    draw();
}
// ============================================================
// SELECTION PAR GLISSEMENT
// ============================================================
function selectTileAt(x,y){
    const index=tileIndexForPoint(x,y);
    if(index<0){
        return;
    }
    if(!selectedTiles.has(index)){
        selectedTiles.add(index);
        draw();
    }
}
// ============================================================
// POINTER DOWN
// ============================================================
function handlePointerDown(event){
    if(event.pointerType==="touch"){
        return;
    }
    event.preventDefault();
    try{
        canvas.setPointerCapture(event.pointerId);
    }
    catch(e){}
    activePointers.set(event.pointerId,{x:event.clientX,y:event.clientY,type:event.pointerType,buttons:event.buttons});
    if(activePointers.size!==1){
        return;
    }
    singlePointer=event.pointerId;
    singlePointerMoved=false;
    const point=canvasPointFromClient(event.clientX,event.clientY);
    lastPointerWorldX=point.x;
    lastPointerWorldY=point.y;
}
// ============================================================
// POINTER MOVE
// ============================================================
function handlePointerMove(event){
    if(event.pointerType==="touch"){
        return;
    }
    event.preventDefault();
    if(!activePointers.has(event.pointerId)){
        return;
    }
    activePointers.set(event.pointerId,{x:event.clientX,y:event.clientY,type:event.pointerType,buttons:event.buttons});
    if(activePointers.size!==1||singlePointer!==event.pointerId){
        return;
    }
    const point=canvasPointFromClient(event.clientX,event.clientY);
    const dx=point.x-lastPointerWorldX;
    const dy=point.y-lastPointerWorldY;
    if(Math.abs(dx)>2||Math.abs(dy)>2){
        singlePointerMoved=true;
    }
    if(event.pointerType==="mouse"&&(event.buttons&1)!==0){
        selectTileAt(point.x,point.y);
    }
    lastPointerWorldX=point.x;
    lastPointerWorldY=point.y;
}
// ============================================================
// POINTER UP
// ============================================================
function handlePointerUp(event){
    if(event.pointerType==="touch"){
        return;
    }
    event.preventDefault();
    const wasSingle=activePointers.size===1&&singlePointer===event.pointerId;
    if(wasSingle&&!singlePointerMoved){
        const point=canvasPointFromClient(event.clientX,event.clientY);
        toggleTileAt(point.x,point.y);
    }
    activePointers.delete(event.pointerId);
    try{
        canvas.releasePointerCapture(event.pointerId);
    }
    catch(e){}
    if(activePointers.size===0){
        singlePointer=null;
        singlePointerMoved=false;
    }
}
// ============================================================
// DISTANCE ENTRE DEUX TOUCHES
// ============================================================
function distanceBetweenTouches(touch1,touch2){
    const dx=touch1.clientX-touch2.clientX;
    const dy=touch1.clientY-touch2.clientY;
    return Math.sqrt(dx*dx+dy*dy);
}
// ============================================================
// TOUCH START
// ============================================================
function handleTouchStart(event){
    console.log("### TOUCHSTART",event.touches.length);
    event.preventDefault();
    touchInteractionActive=true;
    const rect=canvas.getBoundingClientRect();
    if(event.touches.length===2){
        const t1=event.touches[0];
        const t2=event.touches[1];
        lastPinchDistance=distanceBetweenTouches(t1,t2);
        lastPinchCenterX=(t1.clientX+t2.clientX)/2-rect.left;
        lastPinchCenterY=(t1.clientY+t2.clientY)/2-rect.top;
        singlePointerMoved=true;
        return;
    }
    if(event.touches.length===1){
        const touch=event.touches[0];
        const point=canvasPointFromClient(touch.clientX,touch.clientY);
        singlePointerMoved=false;
        lastPointerWorldX=point.x;
        lastPointerWorldY=point.y;
        return;
    }
}
// ============================================================
// TOUCH MOVE
// ============================================================
function handleTouchMove(event){
    console.log("### TOUCHMOVE",event.touches.length);
    event.preventDefault();
    if(event.touches.length===2){
        const t1=event.touches[0];
        const t2=event.touches[1];
        const rect=canvas.getBoundingClientRect();
        const centerX=(t1.clientX+t2.clientX)/2-rect.left;
        const centerY=(t1.clientY+t2.clientY)/2-rect.top;
        const distance=distanceBetweenTouches(t1,t2);
        if(lastPinchDistance<=0){
            lastPinchDistance=distance;
            lastPinchCenterX=centerX;
            lastPinchCenterY=centerY;
            return;
        }
        const worldX=(lastPinchCenterX-panX)/zoomFactor;
        const worldY=(lastPinchCenterY-panY)/zoomFactor;
        let ratio=distance/lastPinchDistance;
        if(!Number.isFinite(ratio)||ratio<=0){
            return;
        }
        let newZoom=zoomFactor*ratio;
        newZoom=Math.max(0.05,Math.min(10.0,newZoom));
        panX=centerX-worldX*newZoom;
        panY=centerY-worldY*newZoom;
        zoomFactor=newZoom;
        lastPinchDistance=distance;
        lastPinchCenterX=centerX;
        lastPinchCenterY=centerY;
        draw();
        return;
    }
    if(event.touches.length===1){
        const touch=event.touches[0];
        const point=canvasPointFromClient(touch.clientX,touch.clientY);
        const dx=point.x-lastPointerWorldX;
        const dy=point.y-lastPointerWorldY;
        if(Math.abs(dx)>2||Math.abs(dy)>2){
            singlePointerMoved=true;
        }
        if(singlePointerMoved){
            selectTileAt(point.x,point.y);
        }
        lastPointerWorldX=point.x;
        lastPointerWorldY=point.y;
    }
}
// ============================================================
// TOUCH END
// ============================================================
function handleTouchEnd(event){
    console.log("### TOUCHEND",event.touches.length);
    event.preventDefault();
    if(event.touches.length===1){
        singlePointerMoved=true;
        lastPinchDistance=0;
        return;
    }
    if(event.touches.length===0){
        if(!singlePointerMoved){
            toggleTileAt(lastPointerWorldX,lastPointerWorldY);
        }
        lastPinchDistance=0;
        singlePointerMoved=false;
        touchInteractionActive=false;
    }
}
// ============================================================
// WHEEL / TRACKPAD
// ============================================================
function handleWheel(event){
    event.preventDefault();
    const rect=canvas.getBoundingClientRect();
    const screenX=event.clientX-rect.left;
    const screenY=event.clientY-rect.top;
    if(event.ctrlKey){
        const worldX=(screenX-panX)/zoomFactor;
        const worldY=(screenY-panY)/zoomFactor;
        const factor=Math.exp(-event.deltaY*0.01);
        let newZoom=zoomFactor*factor;
        newZoom=Math.max(0.05,Math.min(10.0,newZoom));
        panX=screenX-worldX*newZoom;
        panY=screenY-worldY*newZoom;
        zoomFactor=newZoom;
        draw();
        return;
    }
    panX-=event.deltaX;
    panY-=event.deltaY;
    draw();
}
// ============================================================
// EFFACER
// ============================================================
function clearSelection(){
    selectedTiles.clear();
    draw();
    console.log("Sélection effacée.");
}
// ============================================================
// NSKeyedArchiver / Binary Plist ENCODEUR
// ============================================================
class PlistUID{
    constructor(value){
        this.value=value;
    }
}
// ============================================================
// Encodeur Binary Plist
// ============================================================
class BinaryPlistEncoder{
    constructor(root){
        this.root=root;
        this.objects=[];
        this.objectMap=new Map();
        this.collecting=new Set();
    }
    encode(){
        this.collectAllObjects(this.root);
        const objectCount=this.objects.length;
        let objectRefSize;
        if(objectCount<=0xFF){
            objectRefSize=1;
        }
        else if(objectCount<=0xFFFF){
            objectRefSize=2;
        }
        else if(objectCount<=0xFFFFFFFF){
            objectRefSize=4;
        }
        else{
            objectRefSize=8;
        }
        const objectBytes=[];
        const offsets=[];
        let currentOffset=8;
        for(let i=0;i<objectCount;i++){
            offsets.push(currentOffset);
            const bytes=this.encodeObject(this.objects[i],objectRefSize);
            objectBytes.push(bytes);
            currentOffset+=bytes.length;
        }
        const offsetTableOffset=currentOffset;
        let maxOffset=0;
        for(const offset of offsets){
            if(offset>maxOffset){
                maxOffset=offset;
            }
        }
        let offsetIntSize;
        if(maxOffset<=0xFF){
            offsetIntSize=1;
        }
        else if(maxOffset<=0xFFFF){
            offsetIntSize=2;
        }
        else if(maxOffset<=0xFFFFFFFF){
            offsetIntSize=4;
        }
        else{
            offsetIntSize=8;
        }
        const result=[];
        const header=new TextEncoder().encode("bplist00");
        for(const b of header){
            result.push(b);
        }
        for(const bytes of objectBytes){
            for(const b of bytes){
                result.push(b);
            }
        }
        for(const offset of offsets){
            const bytes=this.integerBytes(offset,offsetIntSize);
            for(const b of bytes){
                result.push(b);
            }
        }
        const trailer=new Uint8Array(32);
        trailer[6]=offsetIntSize;
        trailer[7]=objectRefSize;
        this.writeUInt64BE(trailer,8,objectCount);
        this.writeUInt64BE(trailer,16,0);
        this.writeUInt64BE(trailer,24,offsetTableOffset);
        for(const b of trailer){
            result.push(b);
        }
        return new Uint8Array(result);
    }
    collectAllObjects(value){
        const visited=new Set();
        const visit=(object)=>{
            if(object instanceof PlistUID){
                return;
            }
            if(object instanceof Uint8Array){
                this.addObject(object);
                return;
            }
            if(object instanceof ArrayBuffer){
                this.addObject(object);
                return;
            }
            if(object===null||typeof object!=="object"){
                this.addObject(object);
                return;
            }
            if(visited.has(object)){
                return;
            }
            visited.add(object);
            const index=this.addObject(object);
            if(Array.isArray(object)){
                for(const item of object){
                    visit(item);
                }
                return;
            }
            for(const key of Object.keys(object)){
                visit(key);
                visit(object[key]);
            }
        };
        visit(value);
    }
    addObject(value){
        const key=this.objectKey(value);
        if(key!==null&&this.objectMap.has(key)){
            return this.objectMap.get(key);
        }
        const index=this.objects.length;
        this.objects.push(value);
        if(key!==null){
            this.objectMap.set(key,index);
        }
        return index;
    }
    objectKey(value){
        if(value instanceof PlistUID){
            return null;
        }
        if(value instanceof Uint8Array){
            return null;
        }
        if(value instanceof ArrayBuffer){
            return null;
        }
        if(typeof value==="string"){
            return "string:"+value;
        }
        if(typeof value==="number"){
            return "number:"+value;
        }
        if(value===true){
            return "bool:true";
        }
        if(value===false){
            return "bool:false";
        }
        if(value===null){
            return "null";
        }
        return null;
    }
    encodeObject(value,objectRefSize){
        if(value instanceof PlistUID){
            const n=value.value;
            let size;
            if(n<=0xFF){
                size=1;
            }
            else if(n<=0xFFFF){
                size=2;
            }
            else if(n<=0xFFFFFFFF){
                size=4;
            }
            else{
                size=8;
            }
            const result=[];
            result.push(0x80|(size-1));
            const bytes=this.integerBytes(n,size);
            for(const b of bytes){
                result.push(b);
            }
            return new Uint8Array(result);
        }
        if(value===null){
            return new Uint8Array([0x00]);
        }
        if(value===false){
            return new Uint8Array([0x08]);
        }
        if(value===true){
            return new Uint8Array([0x09]);
        }
        if(typeof value==="number"){
            return this.encodeInteger(value);
        }
        if(typeof value==="string"){
            return this.encodeString(value);
        }
        if(value instanceof Uint8Array){
            return this.encodeData(value);
        }
        if(value instanceof ArrayBuffer){
            return this.encodeData(new Uint8Array(value));
        }
        if(Array.isArray(value)){
            return this.encodeArray(value,objectRefSize);
        }
        if(typeof value==="object"){
            return this.encodeDictionary(value,objectRefSize);
        }
        throw new Error("Type Binary Plist non supporté : "+typeof value);
    }
    encodeInteger(value){
        if(!Number.isSafeInteger(value)||value<0){
            throw new Error("Entier non supporté : "+value);
        }
        let size;
        if(value<=0xFF){
            size=1;
        }
        else if(value<=0xFFFF){
            size=2;
        }
        else if(value<=0xFFFFFFFF){
            size=4;
        }
        else{
            size=8;
        }
        let exponent;
        switch(size){
            case 1:
                exponent=0;
                break;
            case 2:
                exponent=1;
                break;
            case 4:
                exponent=2;
                break;
            case 8:
                exponent=3;
                break;
            default:
                throw new Error("Taille entière invalide.");
        }
        const result=[0x10|exponent];
        const bytes=this.integerBytes(value,size);
        for(const b of bytes){
            result.push(b);
        }
        return new Uint8Array(result);
    }
    encodeString(value){
        let ascii=true;
        for(let i=0;i<value.length;i++){
            if(value.charCodeAt(i)>0x7F){
                ascii=false;
                break;
            }
        }
        if(ascii){
            const data=new TextEncoder().encode(value);
            return this.encodeLengthAndPayload(0x50,data);
        }
        const data=[];
        for(let i=0;i<value.length;i++){
            const c=value.charCodeAt(i);
            data.push((c>>8)&0xFF);
            data.push(c&0xFF);
        }
        return this.encodeLengthAndPayload(0x60,new Uint8Array(data));
    }
    encodeData(data){
        return this.encodeLengthAndPayload(0x40,data);
    }
    encodeArray(array,objectRefSize){
        const refs=[];
        for(const value of array){
            refs.push(this.addObject(value));
        }
        const result=[];
        this.appendLengthMarker(result,0xA0,refs.length);
        for(const ref of refs){
            const bytes=this.integerBytes(ref,objectRefSize);
            for(const b of bytes){
                result.push(b);
            }
        }
        return new Uint8Array(result);
    }
    encodeDictionary(dictionary,objectRefSize){
        const keys=Object.keys(dictionary);
        const keyRefs=[];
        const valueRefs=[];
        for(const key of keys){
            keyRefs.push(this.addObject(key));
            valueRefs.push(this.addObject(dictionary[key]));
        }
        const result=[];
        this.appendLengthMarker(result,0xD0,keys.length);
        for(const ref of keyRefs){
            const bytes=this.integerBytes(ref,objectRefSize);
            for(const b of bytes){
                result.push(b);
            }
        }
        for(const ref of valueRefs){
            const bytes=this.integerBytes(ref,objectRefSize);
            for(const b of bytes){
                result.push(b);
            }
        }
        return new Uint8Array(result);
    }
    encodeLengthAndPayload(marker,data){
        const result=[];
        this.appendLengthMarker(result,marker,data.length);
        for(const b of data){
            result.push(b);
        }
        return new Uint8Array(result);
    }
    appendLengthMarker(result,marker,length){
        if(length<15){
            result.push(marker|length);
            return;
        }
        result.push(marker|0x0F);
        const integerBytes=this.encodeInteger(length);
        for(const b of integerBytes){
            result.push(b);
        }
    }
    integerBytes(value,size){
        const result=new Uint8Array(size);
        let n=BigInt(value);
        for(let i=size-1;i>=0;i--){
            result[i]=Number(n&0xFFn);
            n>>=8n;
        }
        return result;
    }
    writeUInt64BE(buffer,offset,value){
        let n=BigInt(value);
        for(let i=7;i>=0;i--){
            buffer[offset+i]=Number(n&0xFFn);
            n>>=8n;
        }
    }
}
// ============================================================
// NSKeyedArchiver
// ============================================================
function buildNSKeyedArchive(grilleBytes,couleurBytes,paletteBytes,selectedIndexes,tileSize){
    const objects=["$null"];
    function addObject(object){
        const index=objects.length;
        objects.push(object);
        return new PlistUID(index);
    }
    const nsDataClass=addObject({
        "$classes":["NSData","NSObject"],
        "$classname":"NSData"
    });
    const nsIndexSetClass=addObject({
        "$classes":["NSIndexSet","NSObject"],
        "$classname":"NSIndexSet"
    });
    const nsDictionaryClass=addObject({
        "$classes":["NSDictionary","NSObject"],
        "$classname":"NSDictionary"
    });
    function addNSData(bytes){
        if(!(bytes instanceof Uint8Array)){
            bytes=new Uint8Array(bytes);
        }
        return addObject({
            "NS.data":bytes,
            "$class":nsDataClass
        });
    }
    function addNumber(value){
        return addObject(Number(value));
    }
    function encodePackedUInt(value){
        if(!Number.isSafeInteger(value)||value<0){
            throw new Error("Valeur NSIndexSet invalide : "+value);
        }
        const bytes=[];
        if(value<128){
            bytes.push(value);
            return bytes;
        }
        while(value>=128){
            bytes.push(128+(value%128));
            value=Math.floor(value/128);
        }
        bytes.push(value);
        return bytes;
    }
    function buildRanges(indexes){
        const values=Array.from(indexes).map(Number).filter(Number.isSafeInteger).filter(v=>v>=0).sort((a,b)=>a-b);
        const ranges=[];
        if(values.length===0){
            return ranges;
        }
        let start=values[0];
        let previous=values[0];
        for(let i=1;i<values.length;i++){
            const current=values[i];
            if(current===previous+1){
                previous=current;
                continue;
            }
            ranges.push({start:start,length:previous-start+1});
            start=current;
            previous=current;
        }
        ranges.push({start:start,length:previous-start+1});
        return ranges;
    }
    function addNSIndexSet(indexes){
        const ranges=buildRanges(indexes);
        const packed=[];
        for(const range of ranges){
            const startBytes=encodePackedUInt(range.start);
            const lengthBytes=encodePackedUInt(range.length);
            for(const b of startBytes){
                packed.push(b);
            }
            for(const b of lengthBytes){
                packed.push(b);
            }
        }
        const rangeData=new Uint8Array(packed);
        const rangeCountUID=addNumber(ranges.length);
        const rangeDataUID=addNSData(rangeData);
        return addObject({
            "NSRangeCount":rangeCountUID,
            "NSRangeData":rangeDataUID,
            "$class":nsIndexSetClass
        });
    }
    const grilleUID=addNSData(grilleBytes);
    const couleurUID=addNSData(couleurBytes);
    const paletteUID=addNSData(paletteBytes);
    const encoursUID=addNSIndexSet(selectedIndexes);
    const storedTileSize=Math.max(1,Math.round(tileSize));
    const tileSizeUID=addNumber(storedTileSize);
    const tileOriginUID=addNumber(1);
    const rootUID=addObject({
        "GRILLE":grilleUID,
        "COULEUR":couleurUID,
        "PALETTE":paletteUID,
        "ENCOURS":encoursUID,
        "TILESIZE":tileSizeUID,
        "TILEORIGIN":tileOriginUID,
        "$class":nsDictionaryClass
    });
    const plist={
        "$version":100000,
        "$archiver":"NSKeyedArchiver",
        "$top":{
            "root":rootUID
        },
        "$objects":objects
    };
    const encoder=new BinaryPlistEncoder(plist);
    return encoder.encode();
}
// ============================================================
// Construction du fichier .grille
// ============================================================
function buildGrilleFile(grilleBytes,couleurBytes,paletteBytes,selectedIndexes,tileSize){
    console.log("Construction de l'archive NSKeyedArchiver...");
    const archive=buildNSKeyedArchive(grilleBytes,couleurBytes,paletteBytes,selectedIndexes,tileSize);
    console.log("Archive NSKeyedArchiver :",archive.length,"octets");
    const compressed=encodeLZFSE(archive);
    console.log("Archive LZFSE :",compressed.length,"octets");
    const output=new Uint8Array(8+compressed.length);
    const view=new DataView(output.buffer);
    view.setBigUint64(0,BigInt(archive.length),true);
    output.set(compressed,8);
    console.log("Fichier .grille final :",output.length,"octets");
    return output;
}
// ============================================================
// SAUVEGARDE D'UNE GRILLE
// ============================================================
async function saveGrilleFile(){
    if(shareInProgress){
        console.log("Partage déjà en cours, sauvegarde ignorée.");
        return;
    }
    try{
        console.log("================================");
        console.log("SAUVEGARDE GRILLE");
        console.log("================================");
        if(!lzfseModule){
            throw new Error("Le module LZFSE n'est pas prêt.");
        }
        if(!sourceImagePNGBytes){
            throw new Error("Les données PNG de GRILLE ne sont pas disponibles.");
        }
        if(!colorImagePNGBytes){
            throw new Error("Les données PNG de COULEUR ne sont pas disponibles.");
        }
        if(!paletteImagePNGBytes){
            throw new Error("Les données PNG de PALETTE ne sont pas disponibles.");
        }
        const selectedIndexes=new Set(selectedTiles);
        console.log("Cases à sauvegarder :",selectedIndexes.size);
        const displayTileSize=Number.isFinite(tileSize)?tileSize:20;
        const storedTileSize=Math.max(1,Math.round(displayTileSize/2));
        console.log("TileSize affiché :",displayTileSize);
        console.log("TileSize stocké :",storedTileSize);
        const grilleFile=buildGrilleFile(
            new Uint8Array(sourceImagePNGBytes),
            new Uint8Array(colorImagePNGBytes),
            new Uint8Array(paletteImagePNGBytes),
            selectedIndexes,
            storedTileSize
        );
        let filename=currentGrilleFileName||"grille.grille";
        if(!filename.toLowerCase().endsWith(".grille")){
            filename+=".grille";
        }
        console.log("Nom fichier :",filename);
        console.log("Taille fichier :",grilleFile.length);
        const file=new File(
            [grilleFile],
            filename,
            {
                type:"application/octet-stream"
            }
        );
        if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
            shareInProgress=true;
            try{
                console.log("Ouverture de la feuille de partage iPad...");
                await navigator.share({
                    files:[file]
                });
                console.log("Partage terminé.");
            }
            catch(error){
                if(error.name==="AbortError"){
                    console.log("Partage annulé par l'utilisateur.");
                }
                else{
                    console.error("Erreur partage :",error);
                    throw error;
                }
            }
            finally{
                shareInProgress=false;
            }
            return;
        }
        const url=URL.createObjectURL(file);
        const a=document.createElement("a");
        a.href=url;
        a.download=filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(()=>{
            URL.revokeObjectURL(url);
        },1000);
        console.log("Téléchargement déclenché :",filename);
    }
    catch(error){
        shareInProgress=false;
        console.error("ERREUR SAUVEGARDE :",error);
        alert("Impossible de sauvegarder la grille :\n\n"+error.message);
    }
}
