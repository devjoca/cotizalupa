import {
  MAX_ORDER_BYTES,
  type AllowedMime,
  isAllowedMime,
} from "./uploadLimits";

export type UploadFile = {
  name: string;
  mime: AllowedMime;
  dataBase64: string;
};

function mimeFromFile(file: File): AllowedMime | null {
  if (isAllowedMime(file.type)) return file.type;
  if (file.type !== "") return null;
  if (/\.pdf$/i.test(file.name)) return "application/pdf";
  if (/\.jpe?g$/i.test(file.name)) return "image/jpeg";
  if (/\.png$/i.test(file.name)) return "image/png";
  return null;
}

// File → base64 payload for the analyze server fn. The server re-validates
// mime and size; this is only so unsupported picks fail fast in the UI.
export function fileToUpload(f: File): Promise<UploadFile> {
  const mime = mimeFromFile(f);
  if (!mime) {
    return Promise.reject(new Error(`tipo no soportado: ${f.name}`));
  }
  if (f.size === 0 || f.size > MAX_ORDER_BYTES) {
    return Promise.reject(
      new Error("El archivo debe pesar entre 1 byte y 25 MB."),
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error(`No se pudo leer el archivo ${f.name}.`));
    reader.onload = () =>
      resolve({
        name: f.name,
        mime,
        dataBase64: String(reader.result).split(",", 2)[1] ?? "",
      });
    reader.readAsDataURL(f);
  });
}
