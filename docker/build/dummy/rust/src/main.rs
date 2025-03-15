use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, SystemTime};
use axum::{
    routing::{get, post},
    Router, Json, http::StatusCode,
};
use serde::Serialize;
use serde_json::{json, Value};
use tokio::signal;

// Simple request counter for basic monitoring
static REQUEST_COUNT: AtomicUsize = AtomicUsize::new(0);
static START_TIME: once_cell::sync::Lazy<SystemTime> = once_cell::sync::Lazy::new(SystemTime::now);

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    requests_handled: usize,
    uptime_seconds: u64,
}

// Handler for logflare API endpoints - simply accepts and discards
async fn logflare_handler() -> Json<Value> {
    REQUEST_COUNT.fetch_add(1, Ordering::SeqCst);
    Json(json!({ "success": true }))
}

// Health check endpoint
async fn health_handler() -> Json<HealthResponse> {
    let uptime = START_TIME.elapsed().unwrap_or(Duration::from_secs(0)).as_secs();
    let count = REQUEST_COUNT.load(Ordering::SeqCst);

    Json(HealthResponse {
        status: "ok".to_string(),
        requests_handled: count,
        uptime_seconds: uptime,
    })
}

// Handler for unknown routes
async fn fallback() -> (StatusCode, &'static str) {
    (StatusCode::NOT_FOUND, "Not found")
}

#[tokio::main]
async fn main() {
    // Initialize logger
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    let port = std::env::var("PORT").unwrap_or_else(|_| "4000".to_string());
    let addr = format!("0.0.0.0:{}", port);

    log::info!("Starting lightweight Logflare sink server on {}", addr);

    // Create a Router to handle routes
    let app = Router::new()
        // Logflare API endpoints - discard everything
        .route("/api/*path", post(logflare_handler))
        .route("/logs", post(logflare_handler))
        .route("/api/*path", get(logflare_handler))
        .route("/logs", get(logflare_handler))
        // Health check endpoint
        .route("/health", get(health_handler))
        .fallback(fallback);

    // Start the server
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    log::info!("Shutdown signal received, starting graceful shutdown");
}
