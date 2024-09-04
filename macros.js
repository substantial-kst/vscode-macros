const vscode = require('vscode');


/**
 * Macro configuration settings
 * { [name: string]: {              ... Name of the macro
 *    no: number,                   ... Order of the macro
 *    func: ()=> string | undefined ... Name of the body of the macro function
 *  }
 * }
 */

module.exports.macroCommands = {
  EditorDate: {
    no: 1,
    func: editorDate
  },
  TerminalDate: {
    no: 2,
    func: terminalDate
  },
  TogglePresentationMode: {
    no: 3,
    func: togglePresentationMode
  },
  CreateContext: {
    no: 4,
    func: createContextBlock
  },
  CreateTest: {
    no: 5,
    func: createTestBlock
  },
  GenerateRubyTestFile: {
    no: 6,
    func: generateRubyTestFile
  }
};

function formattedDate() {
  return new Date().toDateString();
  // Without zero-padded date
  // return new Date().toDateString().replace(/\s0(\d{1})\s/," $1 ")
}

function getEditor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
     throw 'Editor is not open';
  }
  return editor;
}

function getHighlightedEditorText() {
  const editor = getEditor();

  const selection = editor.selection;
  if (!selection || selection.isEmpty) {
    throw 'No selection';
  }

  const selectionRange = new vscode.Range(selection.start.line, selection.start.character, selection.end.line, selection.end.character);
  return { text: editor.document.getText(selectionRange), selection, editor };
}

/**
 * workLogDate
 */
function editorDate() {
  let editor;
  try {
    editor = getEditor();
  } catch(e) {
    return e;
  }

  const selection = editor.selection;
  editor.edit(editBuilder => {
     editBuilder.replace(selection, formattedDate())
  });
}

function terminalDate() {
   const { activeTerminal } = vscode.window;

   if (!activeTerminal) {
      return `Terminal not found.`;
   }
   activeTerminal.sendText(formattedDate(), false)
}

function togglePresentationMode() {
  const { workspace } = vscode

  const min = 0;
  const max = 2;

  const zoomLevel = workspace.getConfiguration('window').get('zoomLevel')

  if (!zoomLevel && zoomLevel !== 0) {
    return `Could not get zoom level`;
  }

  let newZoomLevel;

  if (zoomLevel < max) {
    newZoomLevel = max;
  } else {
    newZoomLevel = min;
  }

  // Clear any zoom level setting overrides in all settings levels (global / user / workspace)
  [1,2,3].forEach(i => workspace.getConfiguration('window').update('zoomLevel', undefined, i))

  workspace.getConfiguration('window').update('zoomLevel', newZoomLevel, 1)
}

/* Tests */

function createContextBlock() {
  const { text, selection, editor } = getHighlightedEditorText();
  editor.edit(editBuilder => {
    editBuilder.replace(selection, `context "${text}" do`);
  });
}

function createTestBlock() {
  const { text, selection, editor } = getHighlightedEditorText();
  editor.edit(editBuilder => {
    editBuilder.replace(selection, `test "${text}" do`);
  });
}

function generateRubyTestFile() {
  const editor = getEditor();
  const { document } = editor;

  const CLOSING = `end`

  let lines = document.lineCount;
  let currentLine = 0;

  const REGEX = {
    line: new RegExp(/^(\s*)([A-Z]{1}): (.*)$/g),
    indentation: new RegExp(/^(\s*).*$/g)
  }

  function codifyRubyContext(content, indentationString) {
    return `${indentationString}context "$TOKEN" do`.replace("$TOKEN", content)
  }

  function codifyRubyTest(content, indentationString, closing=CLOSING) {
    return `${indentationString}test "$TOKEN" do\n${indentationString}${closing}`.replace("$TOKEN", content)
  }

  function getMatchedGroups(text, regex) {
    const matches = [...text.matchAll(regex)];
    let result = { ...matches }

    if (result.length == 0) {
      result[0] = null;
    }

    return result[0];
  }

  const isLineIndentationSameOrLess = lineNumber => {
    const line = document.lineAt(lineNumber)
    const [_originalText, indentation] = getMatchedGroups(line.text, REGEX.indentation)

    return indentation.length <= currentIndentationSize;
  }

  let currentIndentationSize;

  let edits = [];
  let closingEdits = [];

  while (currentLine < lines) {
    let leadingWhitespace, type, content;

    const line = document.lineAt(currentLine)
    const { text, range } = line;

    const matched = getMatchedGroups(text, REGEX.line);
    if (matched == null) {
      currentLine++;
      continue;
    }

    [originalText, leadingWhitespace, type, content] = matched;

    currentIndentationSize = leadingWhitespace.length;

    let newLine

    switch (type) {
      case "C":
      case "D":
      case "S":
        newLine = codifyRubyContext(content, leadingWhitespace);
        edits.push({ method: "replace", range: range, newLine: newLine })

        let lineNumbers = [];

        const remainingLines = Array(lines - currentLine - 1).keys()
        for (const lineNumber of remainingLines) {
          lineNumbers.push(lineNumber + currentLine + 1)
        }

        closingLineNumber = lineNumbers.find(isLineIndentationSameOrLess)
        let closingLineContent = document.lineAt(closingLineNumber)

        let { range: closingRange } = closingLineContent
        const closingLine = `${leadingWhitespace}${CLOSING}\n`
        closingEdits = [{
          method: "insert",
          range: closingRange.start,
          newLine: closingLine
        }, ...closingEdits]

        break;

      case "I":
      case "T":
        newLine = codifyRubyTest(content, leadingWhitespace)
        edits.push({ method: "replace", range: range, newLine: newLine })
        break;
    }

    currentLine++;
  }

  const allEdits = [...edits, ...closingEdits]

  editor.edit(async editBuilder => {
    allEdits.forEach(edit => {
      const { method, range, newLine } = edit;
      editBuilder[method](range, newLine)
    })
  })
}
