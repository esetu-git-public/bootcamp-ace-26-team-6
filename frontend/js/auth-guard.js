// PPE Compliance Detection System - Inline Head Authentication Guard
(function() {
    const session = localStorage.getItem("ppe_session");
    const currentPath = window.location.pathname;
    const isAuthPage = currentPath.includes("login.html") || currentPath.includes("register.html");
    
    // Parse session
    let currentUser = null;
    if (session) {
        try {
            currentUser = JSON.parse(session);
        } catch (e) {
            console.error("Auth Guard session parse error, clearing session:", e);
            localStorage.removeItem("ppe_session");
        }
    }

    if (isAuthPage) {
        // If logged in, auth pages redirect to home
        if (currentUser) {
            window.location.href = "index.html";
        }
    } else {
        // If not logged in, redirect protected pages to login
        if (!currentUser) {
            window.location.href = "login.html";
        } else {
            // Role verification for admin settings panel
            const isAdminPage = currentPath.includes("admin.html");
            if (isAdminPage && currentUser.role !== "Admin") {
                // Redirect back to dashboard with error parameter
                window.location.href = "index.html?auth_alert=admin_only";
            }
        }
    }
})();
