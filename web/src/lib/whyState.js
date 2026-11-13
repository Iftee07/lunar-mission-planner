// Open / pinned state of a <Why> popover (components/why/Why.jsx). Pure, so it is tested without a DOM.
//   hover in, keyboard focus  -> open (a peek: follows the pointer or focus away again)
//   hover out, blur           -> closed, unless pinned
//   click / tap / Enter       -> pinned open (stays to read, focus moves inside); again -> closed
//   Escape, outside click     -> closed
export const WHY_CLOSED = { open: false, pinned: false }

export function whyReducer(state, event) {
  switch (event) {
    case "hoverIn":
    case "focus":
      return state.open ? state : { open: true, pinned: false }
    case "hoverOut":
    case "blur":
      return state.pinned ? state : WHY_CLOSED
    case "click":
      return state.pinned ? WHY_CLOSED : { open: true, pinned: true }
    case "escape":
    case "outside":
      return WHY_CLOSED
    default:
      return state
  }
}
