package script

// Repository is the read/write interface for script storage.
// Implementations may be in-memory, SQLite, or any other backend.
type Repository interface {
	List() []PlayEntry
	Get(id string) (*PlayEntry, bool)
	Add(title, rawMD string) (string, error)
	Delete(id string) bool
	Len() int
	FirstID() string
	IDs() []string
}
