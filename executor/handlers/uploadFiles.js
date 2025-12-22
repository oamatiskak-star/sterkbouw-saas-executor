import fs from "fs"
import path from "path"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
payload verwacht:
{
  bucket: "uploads",
  files: [
    {
      local_path: "/tmp/upload/abc.pdf",
      target_path: "calculaties/abc.pdf",
      content_type: "application/pdf"
    }
  ]
}
*/

export async function handleUploadFiles(task) {
  const payload = task.payload || {}
  const bucket = payload.bucket
  const files = payload.files || []

  if (!bucket) {
    throw new Error("UPLOAD_NO_BUCKET")
  }

  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("UPLOAD_NO_FILES")
  }

  for (const file of files) {
    if (!file.local_path || !file.target_path) {
      throw new Error("UPLOAD_FILE_INVALID_PAYLOAD")
    }

    const buffer = fs.readFileSync(file.local_path)

    const { error } = await supabase.storage
      .from(bucket)
      .upload(file.target_path, buffer, {
        contentType: file.content_type || "application/octet-stream",
        upsert: false
      })

    if (error) {
      throw error
    }
  }

  return {
    status: "done",
    uploaded: files.length
  }
}
