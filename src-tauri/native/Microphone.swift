import Foundation
import AVFoundation

let output = CommandLine.arguments[1]
var recorder: AVAudioRecorder?
var finished = false
func emit(_ event: String, _ error: String? = nil) {
    var message = ["event": event]
    if let error = error { message["error"] = error }
    if let data = try? JSONSerialization.data(withJSONObject: message) {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([10]))
    }
}
func finish() {
    if finished { return }; finished = true
    recorder?.stop(); recorder = nil
    emit("finished"); exit(0)
}
func start() {
    do {
        recorder = try AVAudioRecorder(url: URL(fileURLWithPath: output), settings: [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: 16000,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
        ])
        guard recorder?.prepareToRecord() == true, recorder?.record() == true else {
            emit("error", "Could not start the microphone. Check the selected sound input in System Settings."); exit(1)
        }
        emit("recording")
        DispatchQueue.global().async { _ = readLine(); DispatchQueue.main.async { finish() } }
        DispatchQueue.main.asyncAfter(deadline: .now() + 120) { finish() }
    } catch { emit("error", "Could not initialize microphone recording."); exit(1) }
}
switch AVCaptureDevice.authorizationStatus(for: .audio) {
case .authorized: start()
case .notDetermined:
    AVCaptureDevice.requestAccess(for: .audio) { allowed in
        DispatchQueue.main.async {
            if allowed { start() }
            else { emit("error", "Microphone access was denied. Enable MommyCodex in System Settings → Privacy & Security → Microphone."); exit(1) }
        }
    }
default:
    emit("error", "Enable MommyCodex microphone access in System Settings → Privacy & Security → Microphone."); exit(1)
}
RunLoop.main.run()
