package com.margelo.nitro.nitrorealtimeaudio

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

object MicrophonePermissionManager {

    private var reactContext: ReactApplicationContext? = null

    fun initialize(context: ReactApplicationContext) {
        reactContext = context
    }

    fun requestPermission(
        callback: (MicrophonePermissionStatus) -> Unit
    ) {
        val context = reactContext
            ?: throw IllegalStateException(
                "MicrophonePermissionManager is not initialized."
            )

        val activity = context.currentActivity as? PermissionAwareActivity
            ?: throw IllegalStateException(
                "Current Activity does not support permission requests."
            )

        if (
            ActivityCompat.checkSelfPermission(
                context,
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            callback(MicrophonePermissionStatus.GRANTED)
            return
        }

        val listener = PermissionListener {
                requestCode,
                permissions,
                grantResults ->

            if (requestCode != MICROPHONE_PERMISSION_REQUEST_CODE) {
                return@PermissionListener false
            }

            val granted =
                grantResults.isNotEmpty() &&
                grantResults[0] == PackageManager.PERMISSION_GRANTED

            callback(
                if (granted) {
                    MicrophonePermissionStatus.GRANTED
                } else {
                    MicrophonePermissionStatus.DENIED
                }
            )

            true
        }

        activity.requestPermissions(
            arrayOf(Manifest.permission.RECORD_AUDIO),
            MICROPHONE_PERMISSION_REQUEST_CODE,
            listener
        )
    }

    private const val MICROPHONE_PERMISSION_REQUEST_CODE = 9347
}