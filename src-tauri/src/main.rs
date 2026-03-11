// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

#[tauri::command]
async fn show_main_window(window: tauri::Window) {
    // Buscar y mostrar la ventana principal
    if let Some(main_window) = window.get_webview_window("main") {
        main_window.show().unwrap();
        main_window.set_focus().unwrap();
    }
    
    // Cerrar la ventana de splash
    if let Some(splash_window) = window.get_webview_window("splashscreen") {
        splash_window.close().unwrap();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![show_main_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
