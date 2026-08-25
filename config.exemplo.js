/*
  EmbrioGestor - Configuração de nuvem
  ------------------------------------------------------------
  Para ativar o Google Drive, substitua GOOGLE_CLIENT_ID pelo
  Client ID OAuth 2.0 do seu projeto Google Cloud.

  ATENÇÃO: Client ID não é senha. Nunca coloque Client Secret
  dentro deste arquivo ou em qualquer código que rode no navegador.
*/
window.EMBRIO_CLOUD_CONFIG = {
  GOOGLE_CLIENT_ID: "",
  DRIVE_FOLDER_NAME: "EmbrioGestor",
  DRIVE_MASTER_FILE: "EmbrioGestor_Dados_Principais.json",
  BACKUP_PREFIX: "EmbrioGestor_Backup_"
};
