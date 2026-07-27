 // Debug overlay toggle flags, set to true to enable the corresponding overlay for development and testing purposes.
export const SHOW_DEBUG_OVERLAY = {
  server: true, // Gives information about the server connection status (connected/disconnected)
  group: false, // Gives information about the current group, position, and shared bpm
  playback: true, // Shows playback-related debug information
  tilt: true, // Shows the latest orientation values and analyzer state for tilt gestures
}