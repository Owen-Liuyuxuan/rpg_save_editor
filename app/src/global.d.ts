declare module "*.css";
declare global {
  interface Window {
    saveLab: {
      pickGame(): Promise<any>;
      openSave(game: string, name: string): Promise<any>;
      patch(id: string, p: any): Promise<any>;
      undo(id: string): Promise<any>;
      exportCopy(id: string, name: string): Promise<any>;
    };
  }
}
export {};
