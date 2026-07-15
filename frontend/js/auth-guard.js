// PPE Compliance Detection System - Inline Head Authentication Guard
(function() {
    const session = localStorage.getItem("ppe_session");
    const currentPath = window.location.pathname;
    const isAuthPage = currentPath.includes("login.html");

    // Validate JWT token expiration
    function isSessionValid(sessionData) {
        if (!sessionData || !sessionData.access_token) return false;
        try {
            const payload = JSON.parse(atob(sessionData.access_token.split('.')[1]));
            const exp = payload.exp * 1000;
            return Date.now() < exp;
        } catch (e) {
            return false;
        }
    }

    // Parse and validate session
    let currentUser = null;
    if (session) {
        try {
            const parsed = JSON.parse(session);
            if (isSessionValid(parsed)) {
                currentUser = parsed;
            } else {
                console.warn("Auth Guard: Session expired or invalid, clearing");
                localStorage.removeItem("ppe_session");
            }
        } catch (e) {
            console.error("Auth Guard session parse error, clearing session:", e);
            localStorage.removeItem("ppe_session");
        }
    }

    if (isAuthPage) {
        if (currentUser) {
            window.location.href = "index.html";
        }
    } else {
        if (!currentUser) {
            window.location.href = "login.html";
        }
    }
})();