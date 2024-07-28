import vscode from "vscode";

export const getEditor = () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
     throw 'Editor is not open';
  }
  return editor;
}

export const getHighlightedEditorText = () => {
  const editor = getEditor();

  const selection = editor.selection;
  if (!selection || selection.isEmpty) {
    throw 'No selection';
  }

  const selectionRange = new vscode.Range(selection.start.line, selection.start.character, selection.end.line, selection.end.character);
  return { text: editor.document.getText(selectionRange), selection, editor };
}
