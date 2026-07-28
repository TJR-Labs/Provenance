import { getServerCaller } from "~/server/api/caller";
import { SiteEditor } from "./site-editor";

export default async function CanvasEditorPage() {
  const caller = await getServerCaller();
  const editorState = await caller.site.getEditorState();
  return <SiteEditor initialState={editorState} />;
}
