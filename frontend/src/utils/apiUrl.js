const stripTrailingSlash = (value = "") => String(value || "").replace(/\/+$/, "");

const isLoopbackHost = (host = "") =>
    ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].includes(host);

export const getApiUrl = () => {
    const configuredUrl =
        import.meta.env.VITE_BACKEND_URL ||
        import.meta.env.VITE_API_URL ||
        "http://localhost:5000";

    const normalizedUrl = stripTrailingSlash(configuredUrl);

    if (typeof window === "undefined") return normalizedUrl;

    try {
        const apiUrl = new URL(normalizedUrl);
        const frontendHost = window.location.hostname;

        if (isLoopbackHost(apiUrl.hostname) && !isLoopbackHost(frontendHost)) {
            return "";
        }
    } catch {
        return normalizedUrl;
    }

    return normalizedUrl;
};
