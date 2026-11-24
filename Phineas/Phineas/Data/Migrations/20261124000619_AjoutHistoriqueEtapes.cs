using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Phineas.Data.Migrations
{
    /// <inheritdoc />
    public partial class AjoutHistoriqueEtapes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "HistoriquesEtapeOpportunite",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    OpportuniteId = table.Column<int>(type: "int", nullable: false),
                    AncienneEtape = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    NouvelleEtape = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    DateHeure = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UtilisateurId = table.Column<string>(type: "varchar(450)", maxLength: 450, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HistoriquesEtapeOpportunite", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HistoriquesEtapeOpportunite_AspNetUsers_UtilisateurId",
                        column: x => x.UtilisateurId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_HistoriquesEtapeOpportunite_OpportunitesVente_OpportuniteId",
                        column: x => x.OpportuniteId,
                        principalTable: "OpportunitesVente",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_HistoriquesEtapeOpportunite_OpportuniteId",
                table: "HistoriquesEtapeOpportunite",
                column: "OpportuniteId");

            migrationBuilder.CreateIndex(
                name: "IX_HistoriquesEtapeOpportunite_UtilisateurId",
                table: "HistoriquesEtapeOpportunite",
                column: "UtilisateurId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "HistoriquesEtapeOpportunite");
        }
    }
}
