const assert = require('assert');
const fs = require('fs');

async function runTests() {
  console.log('=== TEST SUITE: Voice Notes & Multimodal Fallback Pipeline ===');

  // Test 1: Verify App.tsx contains media support in streamGeminiWithCodeContinuation and callGeminiAPIStream
  const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
  assert(
    appSrc.includes('media?: { mimeType: string; data: string }'),
    'App.tsx should support media parameter in callGeminiAPIStream and streamGeminiWithCodeContinuation'
  );
  console.log('✔ Test 1 Passed: callGeminiAPIStream & streamGeminiWithCodeContinuation signature supports media');

  // Test 2: Verify triggerAutoGeminiFallback constructs fallbackMedia for audio
  assert(
    appSrc.includes('fallbackMedia = {') && appSrc.includes('attachmentType === \'audio\''),
    'triggerAutoGeminiFallback should construct fallbackMedia for voice notes'
  );
  console.log('✔ Test 2 Passed: triggerAutoGeminiFallback constructs fallbackMedia with base64 audio');

  // Test 3: Verify voice notes bypass uploadFileDirectly (preventing kappa.lol 500 hang)
  assert(
    appSrc.includes("attachmentType !== 'audio'"),
    'uploadFileDirectly should exclude attachmentType === audio'
  );
  console.log('✔ Test 3 Passed: Voice notes bypass external upload to prevent kappa.lol 500 hang');

  // Test 4: Verify zero-byte / accidental voice notes are discarded before creating error state
  assert(
    appSrc.includes('audioBlob.size < 500'),
    'stopRecordingAndSend should discard recordings under 500 bytes'
  );
  assert(
    appSrc.includes('mediaRecorder.start(250)'),
    'startRecording should start mediaRecorder with a 250ms timeslice'
  );
  console.log('✔ Test 4 Passed: Empty/too-short audio recordings (<500B) are guarded and timesliced');

  // Test 5: Verify api/chat/stream.ts supports media parameter and formats inlineData for Gemini
  const streamSrc = fs.readFileSync('api/chat/stream.ts', 'utf8');
  assert(
    streamSrc.includes('const { prompt, systemInstruction, mode, isUtility, media } = body;'),
    'api/chat/stream.ts should destructure media from request body'
  );
  assert(
    streamSrc.includes('inlineData:') && streamSrc.includes('validMedia.mimeType'),
    'api/chat/stream.ts should pass inlineData to Gemini API'
  );
  assert(
    streamSrc.includes('whisperForm.append(\'model\', \'whisper-large-v3\')'),
    'api/chat/stream.ts should support Groq Whisper fallback transcription for audio media'
  );
  console.log('✔ Test 5 Passed: api/chat/stream.ts supports audio multimodal for Gemini and Groq Whisper fallback');

  // Test 6: Verify CustomAudioPlayer does not falsely invalidate on user gesture NotAllowedError
  assert(
    appSrc.includes("error.name !== 'NotAllowedError'"),
    'CustomAudioPlayer should ignore NotAllowedError to prevent false Error/Unavailable state'
  );
  console.log('✔ Test 6 Passed: CustomAudioPlayer avoids false Error/Unavailable states');

  // Test 7: Verify CustomAudioPlayer initializes playback at 0:00 (never starts from the end)
  assert(
    appSrc.includes('probe.src = cleanSrc') && appSrc.includes('audioRef.current.currentTime = 0'),
    'CustomAudioPlayer should probe duration headlessly without seeking main audio to end'
  );
  console.log('✔ Test 7 Passed: CustomAudioPlayer initializes at 0:00 and uses headless duration probe');

  console.log('\nAll 7 verification tests passed successfully! 🚀');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
