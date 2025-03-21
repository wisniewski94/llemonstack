package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync/atomic"
)

// Global request counter
var requestCount uint64 = 0

func main() {
	// Parse flags
	healthCheck := flag.Bool("health-check", false, "Run a health check and exit")
	flag.Parse()

	// If this is a health check request, just check health and exit
	if *healthCheck {
		resp, err := http.Get("http://localhost:4000/health")
		if err != nil || resp.StatusCode != http.StatusOK {
			os.Exit(1)
		}
		os.Exit(0)
	}

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
	fmt.Printf("DUMMY LOG SERVER: Starting server on %s\n", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

func handleAPI(w http.ResponseWriter, r *http.Request) {
	count := atomic.AddUint64(&requestCount, 1)
	fmt.Printf("LOG: #%d from IP %s - %s %s\n",
		count,
		r.RemoteAddr,
		r.Method,
		r.URL.Path)

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

func handleLogs(w http.ResponseWriter, r *http.Request) {
	count := atomic.AddUint64(&requestCount, 1)
	fmt.Printf("LOG: #%d from IP %s - %s /logs\n",
		count,
		r.RemoteAddr,
		r.Method)

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
}
