import imageCompression, { Options } from "browser-image-compression";

export const compressImages = async (
  files: File[],
  options: Options,
): Promise<File[]> => {
  const compressedFiles = await Promise.all(
    files.map(async (file) => {
      const compressedBlob = await imageCompression(file, options);

      return new File([compressedBlob], `frontend-${file.name}`, {
        type: compressedBlob.type,
        lastModified: Date.now(),
      });
    }),
  );

  return compressedFiles;
};
