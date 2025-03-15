package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"sync/atomic"
)

// Global request counter
var requestCount uint64 = 0

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}

	// Setup routes
	http.HandleFunc("/api/", handleAPI)
	http.HandleFunc("/logs", handleLogs)
	http.HandleFunc("/health", handleHealth)

	// Start server
	addr := fmt.Sprintf("0.0.0.0:%s", port)
	fmt.Printf("LOGFLARE-SINK: Starting server on %s\n", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

func handleAPI(w http.ResponseWriter, r *http.Request) {
	count := atomic.AddUint64(&requestCount, 1)
	fmt.Printf("LOGFLARE-SINK: Request #%d from IP %s - %s %s\n",
		count,
		r.RemoteAddr,
		r.Method,
		r.URL.Path)

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

func handleLogs(w http.ResponseWriter, r *http.Request) {
	count := atomic.AddUint64(&requestCount, 1)
	fmt.Printf("LOGFLARE-SINK: Request #%d from IP %s - %s /logs\n",
		count,
		r.RemoteAddr,
		r.Method)

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
}
