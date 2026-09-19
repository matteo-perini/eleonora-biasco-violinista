const functions = require("firebase-functions");
const admin = require("firebase-admin");
const path = require("path");
const sharp = require("sharp");

admin.initializeApp();

exports.convertHeicToJpg = functions.storage.object().onFinalize(async (object) => {
  const fileBucket = object.bucket;
  const filePath = object.name;
  const contentType = object.contentType;
  const fileSizeBytes = parseInt(object.size || "0", 10);

  // Se non è un'immagine, esci
  if (!contentType || !contentType.startsWith("image/")) {
    return console.log("Non è un file immagine.");
  }

  const fileName = path.basename(filePath);
  const fileExtension = path.extname(fileName).toLowerCase();
  const bucket = admin.storage().bucket(fileBucket);
  const tempFilePath = path.join("/tmp", fileName);

  // Scarica il file temporaneamente
  await bucket.file(filePath).download({destination: tempFilePath});

  let targetFilePath = filePath;
  let tempProcessedPath = tempFilePath;
  let needsUpload = false;

  const parsedPath = path.parse(filePath);

  // 1. Se è un file HEIC/HEIF lo convertiamo in JPG
  if (fileExtension === ".heic" || fileExtension === ".heif") {
    console.log("Trovato file HEIC, avvio conversione in JPG:", filePath);
    const newFileName = `${parsedPath.name}.jpg`;
    targetFilePath = path.join(parsedPath.dir, newFileName);
    tempProcessedPath = path.join("/tmp", newFileName);

    await sharp(tempFilePath)
        .toFormat("jpeg")
        .jpeg({ quality: 80 }) // Qualità visiva al 80%
        .toFile(tempProcessedPath);

    needsUpload = true;
  } 
  // 2. Se l'immagine supera i 2 MB (2.097.152 bytes) la comprimiamo riducendo la qualità all'80%
  else if (fileSizeBytes > 2 * 1024 * 1024) {
    console.ل("Immagine superiore a 2MB, avvio compressione:", filePath);
    
    await sharp(tempFilePath)
        .jpeg({ quality: 80, mozjpeg: true })
        .toFile(tempProcessedPath + "_compressed.jpg");
        
    tempProcessedPath = tempProcessedPath + "_compressed.jpg";
    needsUpload = true;
  }

  // Se è stata fatta una modifica (conversione o compressione), carichiamo il nuovo file
  if (needsUpload) {
    console.log("Caricamento del file ottimizzato su Firebase Storage...");
    await bucket.upload(tempProcessedPath, {
      destination: targetFilePath,
      metadata: {contentType: "image/jpeg"},
    });

    // Se abbiamo cambiato estensione (da HEIC a JPG), eliminiamo il vecchio file originale
    if (targetFilePath !== filePath) {
      await bucket.file(filePath).delete();
      console.log("File HEIC originale eliminato con successo.");
    }
    console.log("Processo completato con successo:", targetFilePath);
  } else {
    console.log("L'immagine è già ottimizzata, nessuna modifica necessaria.");
  }
});