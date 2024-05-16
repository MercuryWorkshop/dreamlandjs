// We add some extra properties into various objects throughout, better to use symbols and not interfere. this is just a tiny optimization
export const [USE_COMPUTED, TARGET, PROXY, STEPS, LISTENERS, IF, STATEHOOK] =
    Array.from(Array(7), Symbol)

export const cssBoundary = 'dlcomponent'
