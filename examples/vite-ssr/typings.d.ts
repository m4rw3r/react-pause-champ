/**
 * Vite-generated JSON manifest of bundled and copied files.
 */
declare module "@manifest" {
  /**
   * Metadata for a bundled/copied file.
   */
  export interface FileMetadata {
    /**
     * File-path relative the destination folder.
     */
    file: string;
    /**
     * If the file is an entrypoint.
     */
    isEntry: boolean;
    /**
     * Source file path relative the project root.
     */
    src: string;
  }

  /**
   * Manifest of generated/copied files during bundling.
   */
  export type Manifest = Readonly<Record<string, Readonly<FileMetadata>>>;

  const manifest: Manifest;

  export default manifest;
}
