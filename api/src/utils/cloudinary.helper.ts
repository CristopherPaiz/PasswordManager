import cloudinary from '@config/cloudinary.config.js'
import streamifier from 'streamifier'

interface CloudinaryUploadResult {
  secure_url: string
  public_id: string
}

export const uploadImageToCloudinary = (
  buffer: Buffer,
  folder: string,
  format: string = 'webp',
  transformations: Record<string, unknown>[] = []
): Promise<CloudinaryUploadResult> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        format,
        transformation: transformations
      },
      (error, result) => {
        if (error || !result) {
          return reject(error)
        }
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id
        })
      }
    )
    streamifier.createReadStream(buffer).pipe(uploadStream)
  })
}

export const deleteImageFromCloudinary = async (publicId: string): Promise<void> => {
  if (!publicId) return
  try {
    await cloudinary.uploader.destroy(publicId)
  } catch (error) {
    throw new Error(`Error eliminando imagen de Cloudinary: ${publicId}`)
  }
}
