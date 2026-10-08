"use client";

import { useState, useRef } from "react";
import { Camera, Loader2, User } from "lucide-react";

interface AvatarUploadProps {
  currentImageUrl?: string | null;
  onUploadSuccess: (url: string) => Promise<boolean>;
  entityId: string;
  type: 'student' | 'teacher';
}

export default function AvatarUpload({ currentImageUrl, onUploadSuccess, entityId, type }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic validation
    if (!file.type.startsWith('image/')) {
      alert("Por favor, selecione uma imagem válida.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert("A imagem deve ter no máximo 2MB.");
      return;
    }

    setUploading(true);
    try {
      // O SDK do Firebase (~100-150 KB) só é baixado agora, quando há de fato
      // uma imagem para enviar — não no carregamento de toda página com avatar.
      const [{ getAvatarStorage }, { ref, uploadBytes, getDownloadURL }] = await Promise.all([
        import("@/lib/firebase"),
        import("firebase/storage"),
      ]);
      const storage = await getAvatarStorage();
      const storageRef = ref(storage, `avatars/${type}/${entityId}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const success = await onUploadSuccess(url);
      if (!success) {
        alert("Erro ao salvar o link da imagem no banco de dados.");
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Erro ao fazer upload da imagem.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative group">
      <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl overflow-hidden bg-gray-800 border-2 border-gray-700 shadow-xl relative transition-all group-hover:border-amber-500/50">
        {currentImageUrl ? (
          <img src={currentImageUrl} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500">
            <User className="w-12 h-12" />
          </div>
        )}
        
        {uploading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
          </div>
        )}

        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
        >
          <Camera className="w-8 h-8 text-white" />
        </button>
      </div>
      
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept="image/*"
      />
      
      <div className="absolute -bottom-2 -right-2 bg-amber-500 text-gray-900 p-1.5 rounded-xl shadow-lg border-2 border-gray-900 group-hover:scale-110 transition-transform">
        <Camera className="w-4 h-4" />
      </div>
    </div>
  );
}
