"""Admin API. EVERY route here requires require_admin (or require_super_admin).
A customer hitting any /api/admin/* endpoint gets a 403 from the dependency —
frontend route hiding is never the enforcement mechanism."""
from .dashboard import router as dashboard_router
from .users import router as users_router
from .credits import router as credits_router
from .payments import router as payments_router
from .generations import router as generations_router
from .packages import router as packages_router
from .models import router as aimodels_router
from .settings import admins_router, router as settings_router

__all__ = ["dashboard_router", "users_router", "credits_router",
           "payments_router", "generations_router", "packages_router",
           "aimodels_router", "settings_router", "admins_router"]
