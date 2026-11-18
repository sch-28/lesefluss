# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Keep line numbers so mapped crash traces show source lines.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# R8 full mode treats an annotation type that nothing keeps as never
# instantiated, so reads of the stored plugin annotation fold to null and the
# bridge crashes on the first permission check (LESE-120.4). Capacitor's
# consumer rules keep the plugin classes but not the annotation types.
-keep @interface com.getcapacitor.annotation.* { *; }
-keep @interface com.getcapacitor.PluginMethod { *; }
-keep @interface com.getcapacitor.NativePlugin { *; }
