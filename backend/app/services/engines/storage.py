import os
import uuid
from fastapi import UploadFile

class FileStorageEngine:
    def upload_file(self, file: UploadFile, folder: str = "general") -> str:
        """
        Simulates file upload to Supabase Storage.
        Saves locally in backend/storage/ or returns a virtual mock url in dev.
        """
        file_extension = file.filename.split(".")[-1] if "." in file.filename else "dat"
        unique_filename = f"{uuid.uuid4().hex[:12]}.{file_extension}"
        
        # Virtual local storage path
        virtual_path = f"/storage/{folder}/{unique_filename}"
        
        # In a real environment, we'd do:
        # supabase.storage.from_(folder).upload(unique_filename, file.file)
        
        return virtual_path

    def get_signed_url(self, file_path: str, expires_in_seconds: int = 3600) -> str:
        """
        Generates a temporary read url for secure assets.
        """
        if not file_path:
            return ""
        # Mock signed url
        return f"https://doc-platform-storage.local{file_path}?token=mock_sig_{uuid.uuid4().hex[:8]}"

storage_engine = FileStorageEngine()
