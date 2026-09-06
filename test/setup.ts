/**
 * React only treats `act()` as authoritative when this flag is set. Without it React
 * warns that the environment is not configured for act, and the guarantee that effects
 * and the promises they start have settled is not actually being given — tests then pass
 * on incidental microtask ordering.
 */
globalThis.IS_REACT_ACT_ENVIRONMENT = true
