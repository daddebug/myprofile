import { createElement, useLayoutEffect, useRef, type ElementType } from "react";
import "./inline-layout-text-field.css";

// Layout-preserving inline editing for text that sits inside a fixed
// composition (Homepage Hero, and any future fixed-anchor section) --
// unlike InlineTemplateField (a textarea that REPLACES the display element
// and decides its own width/min-height/padding/border), this component
// keeps rendering the SAME tag with the SAME className in both editing
// states. In edit mode it only adds contentEditable + a data-editable
// attribute for the caller's own outline/box-shadow hint -- never a real
// border, background, or box-model change -- so x/y/width/line-breaks/
// font/line-height stay identical to the non-editing render. Do not use
// this for a field whose editor is meant to grow the layout (Body/Impact's
// textarea editors keep using InlineTemplateField for that reason).
export function InlineLayoutTextField({
  value,
  onChange,
  as,
  className = "",
  placeholder,
  ariaLabel,
  editable,
  multiline = false,
  renderEmpty = false,
}: {
  value: string;
  onChange: (value: string) => void;
  as: ElementType;
  className?: string;
  placeholder?: string;
  ariaLabel: string;
  editable: boolean;
  multiline?: boolean;
  // Some layouts (e.g. a flex row with space-between) need an empty
  // element present even with no value, so the sibling doesn't reflow --
  // matches how the old always-render-a-<span> footer credit behaved.
  renderEmpty?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const isComposingRef = useRef(false);
  const lastCommittedRef = useRef(value);
  const Tag = as;

  // Imperative-only sync: this element's text content is never driven by
  // JSX children while editable (React reconciling {value} into a live
  // contentEditable node fights the user's own DOM edits and caret
  // position on every keystroke -- a well-known contentEditable+React
  // pitfall). Only resync from an external value change, and only while
  // not actively focused/composing, so a remote/other-locale update can
  // still land without clobbering an in-progress edit.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !editable) return;
    if (document.activeElement === el || isComposingRef.current) return;
    if (el.textContent !== value) el.textContent = value;
    lastCommittedRef.current = value;
  }, [value, editable]);

  // innerText (not textContent) so an authored hard line break survives
  // extraction: pressing Enter lets the browser insert its own block
  // structure (a new <div>, in Chromium) at the caret, and textContent
  // concatenates every text node with no separator, silently dropping that
  // break. innerText approximates rendered plain text and inserts "\n" at
  // each such block boundary instead. CRLF is normalized the same way any
  // other plain-text input on this site would be.
  const commit = () => {
    const el = ref.current;
    if (!el) return;
    const next = (el.innerText ?? "").replace(/\r\n?/g, "\n");
    if (next === lastCommittedRef.current) return;
    lastCommittedRef.current = next;
    onChange(next);
  };

  // createElement, not JSX, for this dynamic tag specifically: as: ElementType
  // resolved fine before @react-three/fiber entered the dependency graph, but
  // that package's global `declare module "react" { namespace JSX { interface
  // IntrinsicElements extends ThreeElements {} } }` augmentation (~200 three.js
  // tags merged into the ambient JSX namespace, project-wide, regardless of
  // which files actually import it) made TypeScript infer `children: never`
  // for a generically-typed `<Tag>` here. createElement's own overloads
  // resolve through a different, unaffected path.
  if (!editable) {
    if (value) return createElement(Tag, { className, "data-multiline": multiline || undefined }, value);
    return renderEmpty ? createElement(Tag, { className, "data-multiline": multiline || undefined }) : null;
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" || isComposingRef.current) return;
    event.preventDefault();
    const el = event.currentTarget as HTMLElement;
    if (!multiline) {
      el.blur();
      return;
    }
    // Insert a literal "\n" character at the caret instead of letting
    // the browser run its native Enter behavior (in Chromium, splitting
    // into a new <div>) -- that block structure is exactly what
    // textContent/innerText would otherwise have to reconstruct a
    // break from, and it renders with different geometry (its own
    // margin/line-height) than the plain-text "\n" this field commits
    // and re-syncs as, until the next resync papers over the gap.
    // Not document.execCommand("insertText", ...) -- the usual textbook
    // technique for this, but verified live to silently no-op here when
    // called from inside a real keydown handler (it worked fine invoked
    // from a detached script context, but not from the actual event
    // path). Not a plain Range.insertNode() either: for the common case
    // (a collapsed caret already inside a text node -- true every time
    // this follows ordinary typing), insertNode splits that text node
    // and leaves the caret positioned via an element/child-index Range
    // rather than inside a text node, a representation that behaved
    // inconsistently with this environment's own synthetic typing when
    // verified live (a real browser generally tolerates it, but there's
    // no reason to hand back an unusual Range shape when a same-node
    // edit is just as easy). Text.insertData() mutates the existing
    // text node directly and leaves the caret at a plain
    // (textNode, offset) position, the same shape ordinary typing
    // itself already leaves it in. Falls back to inserting a fresh text
    // node only for the rare case where the caret isn't inside a text
    // node at all (e.g. a still-empty field). commit() is called
    // directly afterward since none of this, unlike execCommand or
    // native typing, dispatches an input event on its own. Shift+Enter
    // is intentionally not distinguished from a plain Enter -- there is
    // no existing distinction to preserve.
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && el.contains(selection.getRangeAt(0).startContainer)) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const container = range.startContainer;
      if (container.nodeType === Node.TEXT_NODE) {
        const textNode = container as Text;
        const offset = range.startOffset;
        textNode.insertData(offset, "\n");
        const nextRange = document.createRange();
        nextRange.setStart(textNode, offset + 1);
        nextRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(nextRange);
      } else {
        const lineBreak = document.createTextNode("\n");
        range.insertNode(lineBreak);
        const nextRange = document.createRange();
        nextRange.setStart(lineBreak, 1);
        nextRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(nextRange);
      }
    }
    commit();
  };

  // No text children here on purpose -- see the useLayoutEffect above.
  // Passing {value} as a JSX child would make React reconcile this live
  // contentEditable node's text on every parent re-render (i.e. after
  // every keystroke, since onChange -> setState -> new value prop), which
  // resets the caret to the end and makes editing in the middle of the
  // text impossible. The effect sets textContent imperatively instead, and
  // skips doing so while this element is focused. createElement, not JSX
  // -- see the comment on the non-editable branch above for why.
  return createElement(Tag, {
    ref,
    className,
    "data-editable": "true",
    "data-multiline": multiline || undefined,
    contentEditable: true,
    suppressContentEditableWarning: true,
    role: "textbox",
    "aria-label": ariaLabel,
    "aria-multiline": multiline,
    "data-placeholder": !value ? placeholder : undefined,
    onInput: commit,
    onBlur: commit,
    onCompositionStart: () => {
      isComposingRef.current = true;
    },
    onCompositionEnd: () => {
      isComposingRef.current = false;
      commit();
    },
    onKeyDown: handleKeyDown,
  });
}
