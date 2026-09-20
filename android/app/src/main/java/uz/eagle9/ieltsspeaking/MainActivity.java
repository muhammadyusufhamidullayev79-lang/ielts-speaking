package uz.eagle9.ieltsspeaking;

import com.getcapacitor.BridgeActivity;

/**
 * Capacitor'ning BridgeWebChromeClient'i WebView'dagi getUserMedia() so'rovini
 * o'zi boshqaradi: RECORD_AUDIO / MODIFY_AUDIO_SETTINGS ruxsatini runtime'da
 * so'raydi va javobga qarab grant/deny qiladi. Shu sabab bu yerda hech narsani
 * override qilmaymiz — ruxsatlar AndroidManifest.xml da e'lon qilingan.
 */
public class MainActivity extends BridgeActivity {}
