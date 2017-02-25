define(function (require, exports, module) {
    "use strict";

    var AppInit = brackets.getModule("utils/AppInit");
    var ExtensionUtils = brackets.getModule("utils/ExtensionUtils");
    var CommandManager = brackets.getModule("command/CommandManager");
    var Menus          = brackets.getModule("command/Menus");
    var CodeInspection  = brackets.getModule('language/CodeInspection');
    var LanguageManager = brackets.getModule('language/LanguageManager');
    var ProjectManager  = brackets.getModule('project/ProjectManager');
    var NodeDomain      = brackets.getModule('utils/NodeDomain');
    var StatusBar       = brackets.getModule("widgets/StatusBar");
    var PreferencesManager = brackets.getModule("preferences/PreferencesManager");
    var Reporter = require("reporter");
    var EditorManager = brackets.getModule("editor/EditorManager");
    var CodeMirror = brackets.getModule("thirdparty/CodeMirror2/lib/codemirror");
    
    var $foo = $("<div class='linterhub-statusbar'>Linterhub: Unable</div>");
    StatusBar.addIndicator("repometric.linterhub-brackets.status", $foo, true, "");
    
    var catalog = null; // TODO: parse languages of active linters and register providers
    var integration = new NodeDomain("linterhub", ExtensionUtils.getModulePath(module, "node/domain"));
    var prefs = PreferencesManager.getExtensionPrefs("repometric.linterhub-brackets");
    var reporter = new Reporter();
    
    var bracketsLinterEnabled = true;
    var CMD_SHOW_LINE_DETAILS = "repometric.linterhub-atom.showLineDetails";
    var linter;

    ExtensionUtils.loadStyleSheet(module, "style.less");
    CommandManager.register("Show Line Details", CMD_SHOW_LINE_DETAILS, handleToggleLineDetails);
    
    prefs.definePreference("cli_path", "string", null);
    prefs.definePreference("run_mode", "number", null);
    
    function addGutter(editor) {
        var cm = editor._codeMirror;
        var gutters = cm.getOption("gutters").slice(0);
        if (gutters.indexOf("repometric-linterhub-gutter") === -1) {
            gutters.unshift("repometric-linterhub-gutter");
            cm.setOption("gutters", gutters);
        }
    }
    
    function activateEditor(editor) {
        editor._codeMirror.on("gutterClick", gutterClick);
    }


    function deactivateEditor(editor) {
        editor._codeMirror.off("gutterClick", gutterClick);
    }


    function gutterClick(cm, lineIndex, gutterId) {
        if (gutterId === "repometric-linterhub-gutter") {
            reporter.toggleLineDetails(lineIndex);
        }
    }

    function handleToggleLineDetails() {
        reporter.toggleLineDetails();
    }
    
    function log_handler(domain, message, type)
    {
        switch(type)
        {
            case "info":
                console.info(message);
                break;
            case "error":
                console.error(message);
                break;
            case "warn":
                console.warn(message);
                break;
        }
    }
    
    function status_handler(domain, message, active)
    {
        if(active) StatusBar.showBusyIndicator();
        else StatusBar.hideBusyIndicator();
        $(".linterhub-statusbar").text("Linterhub: " + message);
    }
    
    function version_handler() {
        integration.exec("version").then(function (result){
            window.alert(result);
        });
    }
    
    function settings_handler(domain, name, value)
    {
        prefs.set(name, value);
    }

    function analyzeFile(text, filePath)
    {
        function convert_type(type)
        {
            switch(type)
            {
                case "problem_type_error": return "error";
                case "problem_type_warning": return "warning";
                case "problem_type_meta": return "warning"; // TODO: add hints to css and Problem Widget
            }
        }
        var deferred = new $.Deferred();
        integration.exec("analyzeFile", filePath)
            .then(function (result) {
                console.log(JSON.stringify(result));
                var activeEditor = EditorManager.getActiveEditor();

                var cm = activeEditor._codeMirror;
                var messages = [];
                result.errors.forEach(function(x){
                    messages.push({
                        "id": x.rule,
                        "code": x.rule,
                        "type": convert_type(x.type),
                        "message": x.message,
                        "token": {
                            "start": x.pos,
                            "end": x.endPos
                        },
                        "pos": {
                            "line": x.pos.line + 1,
                            "ch": x.pos.ch + 1
                        }
                    });
                });
                reporter.report(cm, messages);
                reporter.toggleLineDetails();
                deactivateEditor(EditorManager.getActiveEditor());
                activateEditor(EditorManager.getActiveEditor());
                addGutter(EditorManager.getActiveEditor());
            
                return deferred.resolve(result);
            }, function (err) {
                deferred.reject(err);
            });
        return deferred.promise();
    }
    
    function getCatalog()
    {
        integration.exec("catalog").then(function(data){
            catalog = data;
            return data;
        });
    }

    CommandManager.register("Linterhub Version", "linterhub-menu.version", version_handler);

    var menu = Menus.addMenu("Linterhub", "repometric.linterhub-brackets.main-menu");
    menu.addMenuItem("linterhub-menu.version");
    
    integration.on("log", log_handler);
    integration.on("status", status_handler);
    integration.on("settings", settings_handler);
    
    AppInit.appReady(function () {
        integration.exec("initialize", ProjectManager.getProjectRoot().fullPath, prefs.get("cli_path"), prefs.get("run_mode")).then(function(){
            CodeInspection.register("javascript", {
                name: "Linterhub",
                scanFileAsync: analyzeFile
            });
            getCatalog();
            activateEditor(EditorManager.getActiveEditor());
        });
    });

});