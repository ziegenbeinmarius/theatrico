package auth

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type contextKey int

const operatorIDKey contextKey = iota

// Store holds DB handle and JWT secret.
type Store struct {
	db     *sql.DB
	secret []byte
}

// NewStore creates an auth store with the given DB and JWT signing secret.
func NewStore(db *sql.DB, secret string) *Store {
	return &Store{db: db, secret: []byte(secret)}
}

// Seed upserts the default operator from env vars on every startup.
func (s *Store) Seed(username, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	_, err = s.db.Exec(`
		INSERT INTO operators (id, username, password_hash)
		VALUES (lower(hex(randomblob(16))), ?, ?)
		ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash
	`, username, string(hash))
	return err
}

// Login validates credentials and returns a signed JWT token string.
func (s *Store) Login(username, password string) (string, error) {
	var id, hash string
	err := s.db.QueryRow(
		`SELECT id, password_hash FROM operators WHERE username = ?`, username,
	).Scan(&id, &hash)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("invalid credentials")
	}
	if err != nil {
		return "", err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return "", fmt.Errorf("invalid credentials")
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": id,
		"exp": time.Now().Add(8 * time.Hour).Unix(),
		"iat": time.Now().Unix(),
	})
	return token.SignedString(s.secret)
}

// Validate parses and validates a JWT, returning the operator ID on success.
func (s *Store) Validate(tokenStr string) (string, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.secret, nil
	})
	if err != nil || !token.Valid {
		return "", fmt.Errorf("invalid token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", fmt.Errorf("invalid claims")
	}
	sub, ok := claims["sub"].(string)
	if !ok || sub == "" {
		return "", fmt.Errorf("invalid sub claim")
	}
	return sub, nil
}

// WithOperatorID stores operator ID in context.
func WithOperatorID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, operatorIDKey, id)
}
