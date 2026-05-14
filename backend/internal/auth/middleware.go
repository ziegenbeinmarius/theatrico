package auth

import (
	"net/http"
	"strings"
)

// CookieName is the name of the httpOnly session cookie.
const CookieName = "theatrico_token"

func writeUnauthorized(w http.ResponseWriter) {
	// Clear any stale auth cookie so browser clients recover cleanly on the next request.
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	w.Header().Set("X-Theatrico-Auth", "invalid")
	http.Error(w, "unauthorized", http.StatusUnauthorized)
}

// RequireAuth wraps an HTTP handler, validating the JWT from the
// Authorization: Bearer header or the theatrico_token cookie.
func (s *Store) RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tokenStr := ""
		if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			tokenStr = strings.TrimPrefix(auth, "Bearer ")
		} else if c, err := r.Cookie(CookieName); err == nil {
			tokenStr = c.Value
		}
		if tokenStr == "" {
			writeUnauthorized(w)
			return
		}
		operatorID, err := s.Validate(tokenStr)
		if err != nil {
			writeUnauthorized(w)
			return
		}
		next(w, r.WithContext(WithOperatorID(r.Context(), operatorID)))
	}
}
