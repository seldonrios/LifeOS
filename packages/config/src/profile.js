export function resolveProfile(env, localConfig, defaultsConfig) {
    const envProfile = env.LIFEOS_PROFILE?.trim();
    if (envProfile) {
        return envProfile;
    }
    const localProfile = localConfig.profile;
    if (typeof localProfile === 'string' && localProfile.trim().length > 0) {
        return localProfile;
    }
    const defaultsProfile = defaultsConfig.profile;
    if (typeof defaultsProfile === 'string' && defaultsProfile.trim().length > 0) {
        return defaultsProfile;
    }
    return 'assistant';
}
