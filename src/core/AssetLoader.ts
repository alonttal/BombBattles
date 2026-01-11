export interface AssetManifest {
  images: Record<string, string>;
  audio: Record<string, string>;
}

export class AssetLoader {
  private images: Map<string, HTMLImageElement> = new Map();
  private loadedCount = 0;
  private totalCount = 0;

  async load(manifest: AssetManifest): Promise<void> {
    const imageEntries = Object.entries(manifest.images);
    this.totalCount = imageEntries.length;

    const imagePromises = imageEntries.map(([name, path]) =>
      this.loadImage(name, path)
    );

    await Promise.all(imagePromises);
  }

  private loadImage(name: string, path: string): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(name, img);
        this.loadedCount++;
        resolve();
      };
      img.onerror = () => {
        console.warn(`Failed to load image: ${path}`);
        // Resolve anyway to not block game start
        this.loadedCount++;
        resolve();
      };
      img.src = path;
    });
  }

  getImage(name: string): HTMLImageElement | undefined {
    return this.images.get(name);
  }

  getProgress(): number {
    return this.totalCount === 0 ? 1 : this.loadedCount / this.totalCount;
  }
}
