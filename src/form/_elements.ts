import type { FieldElement, FieldRef } from "./_types";

/** The DOM elements of each field: one for an input, one per option for a radio group. */
export type Elements = Map<string, Set<FieldElement>>;

/**
 * A ref callback that keeps one element of the field in `elements`. Each callback
 * remembers its own element, so React's `null` on unmount removes the right one.
 */
export function elementRef(elements: Elements, name: string): FieldRef {
  let current: FieldElement | null = null;

  return (element) => {
    let set = elements.get(name);

    if (current !== null) set?.delete(current);
    current = element;

    if (element === null) return;

    if (set === undefined) {
      set = new Set();
      elements.set(name, set);
    }
    set.add(element);
  };
}

/**
 * Focuses the first field with an error, in the order of `names`. A field without an
 * element (a custom component driven by `setValue`) or one that cannot take focus
 * (disabled) is skipped. In a radio group the checked option gets focus, as Tab does.
 */
export function focusFirst(
  names: string[],
  hasError: (name: string) => boolean,
  elements: Elements,
): void {
  for (const name of names) {
    if (!hasError(name)) continue;

    const candidates = [...(elements.get(name) ?? [])].filter((element) => element.isConnected);
    const checked = candidates.find((element) => "checked" in element && element.checked);
    const element =
      checked ?? candidates.reduce<FieldElement | undefined>(firstInDocument, undefined);

    if (element === undefined) continue;

    element.focus();

    if (element.ownerDocument.activeElement === element) return;
  }
}

function firstInDocument(
  first: FieldElement | undefined,
  element: FieldElement,
): FieldElement | undefined {
  return first === undefined ||
    element.compareDocumentPosition(first) & element.DOCUMENT_POSITION_FOLLOWING
    ? element
    : first;
}
