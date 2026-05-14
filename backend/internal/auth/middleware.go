package auth

import (
	"net/http"
	"strings"
)

// CookieName is the name of the httpOnly session cookie.
const CookieName = "theatrico_token"

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
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		operatorID, err := s.Validate(tokenStr)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r.WithContext(WithOperatorID(r.Context(), operatorID)))
	}
}
