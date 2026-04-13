export const VALID_TRANSITIONS = {
    added: ['in_cart', 'purchased'],
    in_cart: ['purchased'],
    purchased: [],
};
export function isValidTransition(current, next) {
    return VALID_TRANSITIONS[current].includes(next);
}
