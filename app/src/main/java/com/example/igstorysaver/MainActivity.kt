package com.example.igstorysaver

import android.os.Bundle
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.example.igstorysaver.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupWebView()

        binding.fabDownload.setOnClickListener {
            // Placeholder for download logic
            val currentUrl = binding.webView.url
            android.widget.Toast.makeText(this, "Downloading from: $currentUrl", android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    private fun setupWebView() {
        binding.webView.apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            webViewClient = WebViewClient()
            loadUrl("https://www.instagram.com")
        }
    }

    override fun onBackPressed() {
        if (binding.webView.canGoBack()) {
            binding.webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
